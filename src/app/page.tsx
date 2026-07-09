import { MarbledleGame } from "@/components/MarbledleGame";
import { getDailyPuzzle } from "@/lib/game";

export default function Home() {
  return <MarbledleGame puzzle={getDailyPuzzle()} />;
}
