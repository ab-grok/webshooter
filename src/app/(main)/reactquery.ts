"use client";

import {
  delShot,
  getR2Html,
  getR2Shot,
  getShots,
  getSites,
  getUserData,
  setViewed,
  shotProp,
} from "@/lib/actions";
import { getCrons } from "@/lib/server";
import { shotData, shots, siteData, userData } from "@/lib/types";
import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

//Optimistically Deletes shots:idArray from useQuery data (which triggers UX update), then runs delShot (deleting from db);
export function useMutateDel(site: string) {
  //Do I initialise queryClient per function or once at top of page ?
  const queryClient = useQueryClient();

  const mutateShot = useMutation<
    { error: string | null },
    { error: string },
    number[],
    { prevData: any }
  >({
    //ids passed on invoke
    mutationFn: async (ids) => await delShot({ ids, site }), //returns {error} -- confirm error checking is useMutateDel.error!
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: [site, "shots"] }); //Cancel in-flight fetches
      const prevData = await queryClient.getQueryData([site, "shots"]);

      // queryClient.setQueryData<InfiniteData<shots, { id: any; next: boolean }>> -- this is the correct typing for TPageParam but I reckon 'unknown' is inconsequential?
      queryClient.setQueryData<InfiniteData<shots, unknown>>(
        [site, "shots"],
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              shots: page.shotsData.filter((s) => !ids?.includes(s.id)),
            })),
          };
        },
      );

      return { prevData }; //Is available in context to reset data db request error after optimistic update;
    },
    onError: (err, ids, context) => {
      queryClient.setQueryData([site, "shots"], context?.prevData);
      return err;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [site, "shots"] }); //why invalidateQueries()?
    },
  });

  return {
    mutateDelErr: mutateShot.error,
    //mutateDelErr reads as ```(property) mutateDelErr: {
    // error: string;
    //} | null
    //```
    //But delShot returns {error} which I reckon is referenced by mutateShot. Or is there a default second error nesting made by mutateshot?
    mutatingDel: mutateShot.isPending,
    delReset: mutateShot.reset,
    mutateDel: mutateShot.mutateAsync,
  };
}

export function useMutateShotBinary(site: string) {
  //DEL: Run in a loop to fetch shots one by one fitting vercel serverless fn 4.5mb payload limit;
  //Checks that passed key is not in cache before fetching -- good
  const queryClient = useQueryClient();

  const mutateShotBin = useMutation<
    { shotBin: Uint8Array; shotKey: string },
    { error: string },
    { shotKey: string }
  >({
    mutationFn: async ({ shotKey }) => {
      const { shotBin, error } = await getR2Shot(shotKey);
      if (error) throw { error };
      return { shotBin, shotKey };
    },
    onSuccess: ({ shotBin, shotKey }) => {
      queryClient.setQueryData<any>([site, "downloadShots"], (prev = {}) => ({
        ...prev,
        [shotKey]: shotBin,
      }));
    },
  });

  return {
    shotBinary: mutateShotBin.data,
    getShotBinary: mutateShotBin.mutateAsync,
    shotBinaryError: mutateShotBin.error,
  };
}

export function useMutateHtml(site: string) {
  const queryClient = useQueryClient();

  const mutateHtml = useMutation<
    { html: string; htmlKey: string },
    { error: string },
    { htmlKey: string }
  >({
    mutationFn: async ({ htmlKey }) => {
      const { error, html } = await getR2Html(htmlKey);
      if (error) throw { error };
      return { html, htmlKey };
    },
    onSuccess: ({ html, htmlKey }) => {
      queryClient.setQueryData<Record<string, string>>(
        [site, "html"],
        (prev) => ({
          ...prev,
          [htmlKey]: html,
        }),
      );
    },
  });

  return {
    html: mutateHtml.data,
    getHtml: mutateHtml.mutateAsync,
    htmlError: mutateHtml.error,
  };
}

//Calls setViewed when a shot is opened
export function useMutateViewed(site: string) {
  const queryClient = useQueryClient();

  const mutateViewed = useMutation<
    { error: null | string },
    { error: string },
    { ids: number[] },
    { prevData: any }
  >({
    mutationFn: async ({ ids }) => await setViewed({ ids, site }),
    onMutate: async ({ ids }) => {
      await queryClient.cancelQueries({ queryKey: [site, "shots"] });
      const prevData = await queryClient.getQueryData([site, "shots"]);

      queryClient.setQueryData<InfiniteData<shots, unknown>>(
        [site, "shots"],
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              shots: page.shotsData.map((s: shotData) =>
                ids?.includes(s.id) ? { ...s, viewed: true } : s,
              ),
            })),
          };
        },
      );

      return { prevData };
    },
    onError: async (err, vars, context) => {
      await queryClient.setQueryData([site, "shots"], context?.prevData);
      return err;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [site, "shots"] });
    },
  });

  return {
    mutateViewed: mutateViewed.mutateAsync,
    mutateViewedErr: mutateViewed.error,
    mutatingViewed: mutateViewed.isPending,
    resetViewed: mutateViewed.reset, //clears flags: errors and prevData
  };
}

// Set Confirm Dialog before deleting sites -- as fn drops column including all shots and cron.
export function useMutateSites() {
  //use to delete or add sites and update cache
}

//Updating viewed per shot in other function, and then, also set state to viewed in client state. -- run refetch to check change speed (expensive).
export function useQueryShots(site: string) {
  const shotQuery = useInfiniteQuery<
    shots,
    { error: string },
    InfiniteData<shots>,
    [string, string],
    { id: any; next: boolean }
  >({
    queryKey: [site, "shots"],
    queryFn: async ({ pageParam }) => {
      const { id, next } = pageParam;
      //when error: all props besides error will be null;
      const { error, ...shots } = await getShots({ id, next, site });
      if (error) throw { error };
      return shots;
    },
    getNextPageParam: (lastPage) => ({
      id: lastPage.nextCursor,
      next: true,
    }),
    getPreviousPageParam: (firstPage) => ({
      id: firstPage.prevCursor,
      next: false,
    }),
    initialPageParam: { id: null, next: true },
    staleTime: 60000 * 10, //increasing staleTime -- refetches do not need to be performed in auto -- will use refetch to handle viewed.
  });

  return {
    shots: shotQuery.data,
    shotsError: shotQuery.error,
    shotsLoading: shotQuery.isLoading,
    shotsFetching: shotQuery.isFetching, //(true for any request ) -- fetchingNext/PrevShots suffices for that.
    shotsRefetching: shotQuery.isRefetching,
    fetchNextShots: shotQuery.fetchNextPage,
    fetchPrevShots: shotQuery.fetchPreviousPage,
    fetchingNextShots: shotQuery.isFetchingNextPage,
    fetchingPrevShots: shotQuery.isFetchingPreviousPage,
    shotsRefetch: shotQuery.refetch,
  };
}

export function useQueryCrons() {
  const cronsQuery = useQuery<
    { crons: Array<{ cron: string }> },
    { error: string }
  >({
    queryKey: ["sites"],
    queryFn: async () => {
      const { error, crons } = await getCrons();
      if (error) throw { error };
      return { crons };
    },
    staleTime: Infinity,
  });

  return {
    cronsLoading: cronsQuery.isLoading,
    cronsError: cronsQuery.error,
    crons: cronsQuery.data,
    cronsFetching: cronsQuery.isFetching,
    cronsRefetch: cronsQuery.refetch,
  };
}

export function useUserData() {
  const userQuery = useQuery<userData, { error: any }>({
    queryKey: ["userData"],
    queryFn: async () => {
      const { error, ...rest } = await getUserData();
      if (error) throw error;
      return rest;
    },
    staleTime: Infinity,
  });

  return {
    userData: userQuery.data,
    userDataError: userQuery.error,
    userDataLoading: userQuery.isLoading,
  };
}

export function useQuerySites() {
  //isFetching = true when fetching in background.
  const sitesQuery = useQuery<siteData[], { error: string }>({
    queryKey: ["sites"],
    queryFn: async () => {
      const { userSites } = await getSites();

      if (!userSites) throw { error: "No userSites!" };

      console.log("In useQuerSites", { userSites });
      return userSites as siteData[];
    },
    staleTime: Infinity,
  });

  return {
    sitesLoading: sitesQuery.isLoading,
    sitesError: sitesQuery.error,
    sites: sitesQuery.data,
    sitesFetching: sitesQuery.isFetching,
    sitesRefetch: sitesQuery.refetch,
  };
}
