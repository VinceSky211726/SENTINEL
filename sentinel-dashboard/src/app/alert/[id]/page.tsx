import { notFound } from "next/navigation";
import { AlertDetail } from "@/components/alert/AlertDetail";
import { fetchEventById, fetchPortfolio } from "@/lib/queries";

export default async function AlertPage({
  params,
}: {
  params: { id: string };
}) {
  const [event, portfolioRows] = await Promise.all([
    fetchEventById(params.id),
    fetchPortfolio(),
  ]);

  if (!event) notFound();

  const portfolio =
    portfolioRows.find((p) => p.symbol === event.symbol) ?? null;

  return <AlertDetail event={event} portfolio={portfolio} />;
}
