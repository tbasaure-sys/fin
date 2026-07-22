import { PortfolioChannelWorkbench } from "@/components/channels/portfolio-channel-workbench";

export const metadata = {
  title: "Portfolio Intelligence | BLS Prime",
  description:
    "Confirm your holdings, measure effective bets and correlation clusters, then build a concrete weekly research queue.",
};

export default function ChannelsPage() {
  return <PortfolioChannelWorkbench />;
}
