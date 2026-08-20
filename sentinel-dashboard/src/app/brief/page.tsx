import { BriefView } from "@/components/brief/BriefView";
import { fetchBriefStats, fetchPortfolio } from "@/lib/queries";

export default async function BriefPage() {
  const portfolio = await fetchPortfolio();
  const stats = await fetchBriefStats(portfolio);
  return <BriefView stats={stats} />;
}
