import { requireSessionUserId } from "@/lib/session";
import { db } from "@/server/db";
import LibraryBrowser from "@/components/LibraryBrowser";

export default async function LibraryPage() {
  await requireSessionUserId();

  const total = await db.plantLibraryEntry.count();

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Bibliothèque de plantes</h1>
      <p className="text-muted text-sm">
        {total} profils de soin de référence, utilisables directement en tapant le nom d&apos;une plante lors de son ajout.
      </p>
      <LibraryBrowser />
    </div>
  );
}
