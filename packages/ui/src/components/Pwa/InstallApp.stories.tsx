import type { Meta, StoryObj } from "@storybook/react";
import { InstallAppPrompt } from "./InstallApp";

const meta: Meta<typeof InstallAppPrompt> = {
  component: InstallAppPrompt,
  args: {
    canInstall: false,
    showIosHint: false,
    onInstall: () => {},
    onDismissIosHint: () => {},
  },
};

export default meta;
type Story = StoryObj<typeof InstallAppPrompt>;

/** Chromium fired `beforeinstallprompt`: a discreet button on the review screen. */
export const InstallButton: Story = { args: { canInstall: true } };

/** Icon-only, for the review session top bar. */
export const InstallButtonCompact: Story = { args: { canInstall: true, compact: true } };

/** iOS has no prompt: a one-line, dismissible hint (remembered per browser). */
export const IosHint: Story = {
  args: { showIosHint: true },
  parameters: { viewport: { defaultViewport: "phone375" } },
};

/** Already installed, or a desktop browser without a prompt: nothing renders. */
export const NothingToOffer: Story = {};
