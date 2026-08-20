import { PortfolioView } from "@/components/portfolio/PortfolioView";
import { fetchFeedEvents, fetchPortfolio } from "@/lib/queries";

export default async function PortfolioPage() {
  const [portfolio, events] = await Promise.all([
    fetchPortfolio(),
    fetchFeedEvents(),
  ]);
  return <PortfolioView initialRows={portfolio} events={events} />;
}
