import type { Preview } from "@storybook/react";
import "../src/styles/theme.css";
import "../src/styles/popup.css";
import "../src/styles/review.css";
import "../src/styles/player.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { expanded: true },
  },
  globalTypes: {
    theme: {
      description: "Fuchine theme",
      defaultValue: "light",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, ctx) => {
      const theme = ctx.globals.theme === "dark" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", theme);
      return (
        <div
          data-theme={theme}
          style={{ background: "var(--bg)", color: "var(--text)", padding: "40px", borderRadius: 12 }}
        >
          <Story />
        </div>
      );
    },
  ],
};

export default preview;
