import { PortfolioView } from "@/components/portfolio/PortfolioView";
import { fetchArbitrageEvents, fetchPortfolio } from "@/lib/queries";

export default async function PortfolioPage() {
  const [portfolio, events] = await Promise.all([
    fetchPortfolio(),
    fetchArbitrageEvents(),
  ]);
  return <PortfolioView initialRows={portfolio} events={events} />;
}
