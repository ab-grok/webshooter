"use client";

import {
  delShot,
  delSite,
  getCronSchedules,
  getShots,
  getSites,
  getUserData,
  scheduleShot,
  setViewed,
} from "@/lib/actions";
import {
  appCrons,
  mutateSite,
  shotData,
  shots,
  siteData,
  userData,
} from "@/lib/types";
import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

//Optimistically Deletes shots:idArray from useQuery data (which triggers UX update), then runs delShot (deleting from db);
export function useMutateDel(site: string) {
  const queryClient = useQueryClient();

  const mutateShot = useMutation<
    { error: null },
    Error,
    number[],
    { prevData: InfiniteData<shots, unknown> | undefined }
  >({
    mutationFn: async (ids) => {
      const res = await delShot({ ids, site });
      if (!res || (typeof res.error !== "string" && res.error !== null))
        throw new Error("Invalid delete-shot response.");
      const { error } = res;
      if (error) throw new Error(error);
      return { error: null };
    },
    onMutate: async (ids) => {
      await queryClient.cancelQueries({ queryKey: [site, "shots"] }); //Cancel in-flight fetches
      const prevData = queryClient.getQueryData<InfiniteData<shots, unknown>>([
        site,
        "shots",
      ]);

      // queryClient.setQueryData<InfiniteData<shots, { id: any; next: boolean }>> -- this is the correct typing for TPageParam but I reckon 'unknown' is inconsequential?
      queryClient.setQueryData<InfiniteData<shots, unknown>>(
        [site, "shots"],
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              shotsData: page.shotsData.filter((s) => !ids.includes(s.id)),
            })),
          };
        },
      );

      return { prevData }; //Is available in context to reset data db request error after optimistic update;
    },
    onError: (_error, _ids, context) => {
      queryClient.setQueryData([site, "shots"], context?.prevData);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [site, "shots"] }); //why invalidateQueries()?
    },
  });

  return {
    mutateDelErr: mutateShot.error,
    mutatingDel: mutateShot.isPending,
    delReset: mutateShot.reset,
    mutateDel: mutateShot.mutateAsync,
  };
}

// export function useMutateShotBinary(site: string) {
//   //DEL: Run in a loop to fetch shots one by one fitting vercel serverless fn 4.5mb payload limit;
//   //Checks that passed key is not in cache before fetching -- good
//   const queryClient = useQueryClient();

//   const mutateShotBin = useMutation<
//     { shotBlob: Blob; shotUrl: string },
//     Error,
//     { shotUrl: string }
//   >({
//     mutationFn: async ({ shotUrl }) => {
//       const res = await fetch(shotUrl);

//       let error = "";
//       if (!res?.ok) {
//         const e = (await res.json())?.error;
//         error = "Could not fetch ShotBinary: " + error;
//         throw new Error(error);
//       }

//       const shotBlob = await res.blob();
//       return { shotBlob, shotUrl };
//     },
//     onSuccess: ({ shotBlob, shotUrl }) => {
//       queryClient.setQueryData<any>([site, "downloadShots"], (prev = {}) => ({
//         ...prev,
//         [shotUrl]: shotBlob,
//       }));
//     },
//   });

//   return {
//     shotBinary: mutateShotBin.data,
//     getShotBinary: mutateShotBin.mutateAsync,
//     shotBinaryError: mutateShotBin.error,
//   };
// }

// export function useMutateHtml(site: string) {
//   const queryClient = useQueryClient();

//   const mutateHtml = useMutation<
//     { html: Blob; htmlKey: string },
//     { error: string },
//     { htmlKey: string }
//   >({
//     mutationFn: async ({ htmlKey }) => {
//       const { error, html } = await getR2Html(htmlKey);
//       if (error || !html) throw { error: error || "No Html Blob!" };
//       return { html, htmlKey };
//     },
//     onSuccess: ({ html, htmlKey }) => {
//       queryClient.setQueryData<Record<string, Blob>>(
//         [site, "html"],
//         (prev) => ({
//           ...prev,
//           [htmlKey]: html,
//         }),
//       );
//     },
//   });

//   return {
//     html: mutateHtml.data,
//     getHtml: mutateHtml.mutateAsync,
//     htmlError: mutateHtml.error,
//   };
// }

//Calls setViewed when a shot is opened

export function useMutateViewed(site: string) {
  const queryClient = useQueryClient();

  const mutateViewed = useMutation<
    { error: null | string },
    Error,
    { ids: number[] },
    { prevData: InfiniteData<shots, unknown> | undefined }
  >({
    mutationFn: async ({ ids }) => {
      const res = await setViewed({ ids, site });
      if (!res || ("error" in res && typeof res.error == "string"))
        throw new Error(res?.error || "Invalid setViewed Return!");

      return { error: null };
    },
    onMutate: async ({ ids }) => {
      await queryClient.cancelQueries({ queryKey: [site, "shots"] });
      const prevData = queryClient.getQueryData<InfiniteData<shots, unknown>>([
        site,
        "shots",
      ]);

      queryClient.setQueryData<InfiniteData<shots, unknown>>(
        [site, "shots"],
        (oldData) => {
          if (!oldData) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) => ({
              ...page,
              shotsData: page.shotsData.map((s) =>
                ids.includes(s.id) ? { ...s, viewed: true } : s,
              ),
            })),
          };
        },
      );

      return { prevData };
    },
    onError: (_error, _vars, context) => {
      queryClient.setQueryData([site, "shots"], context?.prevData);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [site, "shots"] });
    },
  });

  return {
    mutateViewed: mutateViewed.mutateAsync, // Q: considering sending a success message from server. Does mutateViewed return the value from mutationFn?
    mutateViewedErr: mutateViewed.error,
    mutatingViewed: mutateViewed.isPending,
    resetViewed: mutateViewed.reset, //clears flags: errors and prevData
  };
}

// Add or delete sites
export function useMutateSites() {
  const queryClient = useQueryClient();

  const deleteSiteMutation = useMutation<
    siteData,
    Error,
    mutateSite,
    { previousSites: siteData[] | undefined }
  >({
    //Q: I thought mutationFn expected args from TData: deleteSite? why it throws errror
    mutationFn: async ({ siteData, del }) => {
      if (!isSiteData(siteData)) throw new Error("Invalid Site Data Shape!");

      if (del) {
        const res = await delSite(siteData);
        if (!res || ("error" in res && typeof res?.error == "string"))
          throw new Error(res?.error || "Invalid deleteSite Response");
      } else {
        const res = await scheduleShot(siteData);
        if (!res || ("error" in res && typeof res?.error == "string"))
          throw new Error(res?.error || "Invalid addSite Response");
      }
      return siteData;
    },
    onMutate: async ({ siteData, del }) => {
      if (!isSiteData(siteData)) throw new Error("Invalid Site Data Shape!");

      await queryClient.cancelQueries({ queryKey: ["sites"] });
      const previousSites = queryClient.getQueryData<siteData[]>(["sites"]);

      if (del)
        // Filter out site on delete
        queryClient.setQueryData<siteData[]>(["sites"], (allSites) =>
          allSites?.filter((currSite) => currSite.site !== siteData.site),
        );
      // Include site to cache on add
      else {
        if (previousSites?.some((s) => s.site == siteData.site))
          throw new Error("Site Exists, Change cron instead!");

        queryClient.setQueryData<siteData[]>(["sites"], (allSites) => [
          ...(allSites || []),
          siteData,
        ]);
      }
      return { previousSites };
    },
    onError: (_error, _site, context) => {
      queryClient.setQueryData(["sites"], context?.previousSites);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
    },
  });

  function addSite(siteData: siteData) {
    return deleteSiteMutation.mutateAsync({ siteData });
  }

  function deleteSite(siteData: siteData) {
    return deleteSiteMutation.mutateAsync({ siteData, del: true });
  }

  return {
    addSite, //Q: I reckon I can still do await site?
    deleteSite, // Q: this requires await deleteSite? //Both return Promise<siteData>
    deleteSiteError: deleteSiteMutation.error,
    deletingSite: deleteSiteMutation.isPending,
    resetDeleteSite: deleteSiteMutation.reset,
  };
}

//Fetches user's screenshot data (shot url + html url)
export function useQueryShots(site: string) {
  const shotQuery = useInfiniteQuery<
    shots,
    Error,
    InfiniteData<shots>,
    [string, string],
    { id: any; next: boolean }
  >({
    queryKey: [site, "shots"],
    queryFn: async ({ pageParam }) => {
      const { id, next } = pageParam;
      //when error: all props besides error will be null;
      const res = await getShots({ id, next, site });
      if (!res) throw new Error("No shots response returned.");
      const { error, ...shotsQueryData } = res;
      if (error) throw new Error(error);

      if (isNotUserShots(shotsQueryData))
        throw new Error("Invalid shotData shape.", { cause: shotsQueryData });
      return shotsQueryData;
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
    // increasing staleTime to 1 hour -- this is to recompute noMoreNext after all recent shots
    // have been fetched, this may require capturePosition
    // since refetching pages may include more shots to recent <20 shots page.
    staleTime: 1000 * 60 * 60,
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

// Get all available crons
export function useQueryCrons() {
  const cronsQuery = useQuery<{ crons: Array<{ cron: string }> }, Error>({
    queryKey: ["crons"],
    queryFn: async () => {
      //change to getCronSchedules
      const res = (await getCronSchedules()) as appCrons;
      if (!res || ("error" in res && typeof res.error == "string"))
        throw new Error(res.error || "No cron response returned.");

      const { crons } = res;
      if (!Array.isArray(crons) || !crons.every(isAppCron))
        throw new Error("Invalid cron schedules response.");
      return { crons };
    },
    staleTime: Infinity,
  });

  return {
    cronsLoading: cronsQuery.isLoading,
    cronsError: cronsQuery.error,
    crons: cronsQuery.data?.crons,
    cronsFetching: cronsQuery.isFetching,
    cronsRefetch: cronsQuery.refetch,
  };
}

// Get user data
export function useQueryUserData() {
  const userQuery = useQuery<userData>({
    queryKey: ["userData"],
    queryFn: async () => {
      const res = (await getUserData()) || {};
      const { error, ...userData } = res;
      if (error) throw new Error(error);
      if (typeof userData?.user !== "string")
        throw new Error("Invalid getUserData response.");
      return userData;
    },
    staleTime: Infinity,
  });

  return {
    userData: userQuery.data,
    userDataError: userQuery.error,
    userDataLoading: userQuery.isLoading,
  };
}

// Get the sites
export function useQuerySites() {
  //isFetching = true when fetching in background.
  const sitesQuery = useQuery<siteData[], Error>({
    queryKey: ["sites"],
    queryFn: async () => {
      const res = await getSites();
      const userSites: unknown = res?.userSites;

      if (!Array.isArray(userSites))
        throw new Error("No user sites were returned.");
      if (!userSites.every(isSiteData))
        throw new Error("Invalid userSite shape!");

      return userSites;
    },
    staleTime: Infinity,
  });

  return {
    sitesLoading: sitesQuery.isLoading,
    sitesError: sitesQuery.error,
    sitesData: sitesQuery.data,
    sitesFetching: sitesQuery.isFetching,
    sitesRefetch: sitesQuery.refetch,
  };
}

// ===========> Helpers
const isShotData = (shot: unknown): shot is shotData =>
  typeof shot === "object" &&
  shot !== null &&
  "id" in shot &&
  typeof shot.id === "number" &&
  "date" in shot &&
  typeof shot.date === "string" &&
  "viewed" in shot &&
  typeof shot.viewed === "boolean" &&
  "htmlKey" in shot &&
  typeof shot.htmlKey === "string" &&
  "shotKey" in shot &&
  typeof shot.shotKey === "string" &&
  "shotUrl" in shot &&
  typeof shot.shotUrl === "string" &&
  "htmlUrl" in shot &&
  typeof shot.htmlUrl === "string";

const isNotUserShots = (shotsQueryData: any) =>
  !Array.isArray(shotsQueryData.shotsData) ||
  !shotsQueryData.shotsData.every(isShotData) ||
  typeof shotsQueryData.noMoreNext !== "boolean" ||
  typeof shotsQueryData.noMorePrev !== "boolean" ||
  (shotsQueryData.shotsData.length > 0 &&
    (typeof shotsQueryData.nextCursor !== "number" ||
      typeof shotsQueryData.prevCursor !== "number"));

const isAppCron = (cron: any): cron is { cron: string } =>
  "cron" in cron && typeof cron.cron == "string";

const isSiteData = (site: unknown): site is siteData =>
  typeof site === "object" &&
  site !== null &&
  "site" in site &&
  typeof site.site === "string" &&
  "cron" in site &&
  typeof site.cron === "string" &&
  "active" in site &&
  typeof site.active === "boolean";
