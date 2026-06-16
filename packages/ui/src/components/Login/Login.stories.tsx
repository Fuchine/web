import type { Meta, StoryObj } from "@storybook/react";
import { Login } from "./Login";

const meta: Meta<typeof Login> = {
  title: "Composed/Login",
  component: Login,
  parameters: { layout: "fullscreen" },
  args: { onSubmit: (v, m) => console.log("submit", m, v), onGoogle: () => {} },
  decorators: [(Story) => <div style={{ height: 660, overflow: "hidden", borderRadius: 12, border: "1px solid var(--border)" }}><Story /></div>],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {};
export const SignUp: Story = { args: { defaultMode: "signup" } };
export const Loading: Story = { args: { loading: true } };
export const Error: Story = { args: { error: "Email or password is incorrect." } };
