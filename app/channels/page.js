import { ChannelQuestionnaire } from "@/components/channels/channel-questionnaire";

export const metadata = {
  title: "Channel Finder | BLS Prime",
  description:
    "A public, private-by-default diagnostic for finding lawful information channels worth testing before researching a stock.",
};

export default function ChannelsPage() {
  return <ChannelQuestionnaire />;
}
