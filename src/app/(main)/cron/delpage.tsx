// // app/cron/page.tsx
// import CronScheduler from "@/components/CronScheduler";
// import { ArrowLeft } from "lucide-react";
// import Link from "next/link";
// import { Button } from "@/components/ui/button";

// export const metadata = {
//   title: "Cron Scheduler - Shooter",
//   description: "Schedule automated screenshots on a cron schedule",
// };

// export default function CronPage() {
//   // TODO: Get actual user from auth context
//   const user = "demo-user";

//   return (
//     <main className="bg-background min-h-screen">
//       <div className="mx-auto max-w-5xl px-4 py-8">
//         <div className="mb-8">
//           <Button variant="ghost" size="sm" asChild className="mb-4 gap-2">
//             <Link href="/">
//               <ArrowLeft className="h-4 w-4" />
//               Back to Gallery
//             </Link>
//           </Button>
//           <h1 className="text-3xl font-bold tracking-tight">Cron Scheduler</h1>
//           <p className="text-muted-foreground mt-2">
//             Set up automated screenshots for any website on your preferred
//             schedule.
//           </p>
//         </div>
//         {/* Scheduler Component */}
//         <CronScheduler />
//       </div>
//     </main>
//   );
// }
