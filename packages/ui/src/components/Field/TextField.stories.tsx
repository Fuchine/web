import type { Meta, StoryObj } from "@storybook/react";
import { TextField } from "./TextField";

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 15l6-6M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

const meta: Meta<typeof TextField> = {
  title: "Primitives/TextField",
  component: TextField,
  args: { label: "Email", placeholder: "you@example.com" },
  argTypes: { leadingIcon: { control: false } },
  parameters: { layout: "padded" },
  decorators: [(Story) => <div style={{ width: 360 }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHelper: Story = {
  args: { label: "Explanation language", helper: "Translations and explanations appear in this language." },
};

export const WithError: Story = {
  args: { label: "Email", value: "not-an-email", error: "Enter a valid email address." },
};

export const LabelAction: Story = {
  args: {
    label: "Password",
    type: "password",
    placeholder: "••••••••",
    labelAction: (
      <button className="text-[12.5px] font-medium text-muted hover:text-link" type="button">
        Forgot password?
      </button>
    ),
  },
};

export const LeadingIcon: Story = {
  args: { label: undefined, leadingIcon: <LinkIcon />, placeholder: "Paste a YouTube link to study" },
};

export const Disabled: Story = { args: { label: "Email", value: "locked@example.com", disabled: true } };
