import type { Preview } from "@storybook/react";
import "../src/styles/theme.css";
import "../src/styles/popup.css";
import "../src/styles/review.css";
import "../src/styles/player.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { expanded: true },
    // T3.13 — phone widths the review PWA must be comfortable at.
    viewport: {
      viewports: {
        phone360: { name: "Phone 360 (Android)", styles: { width: "360px", height: "780px" }, type: "mobile" },
        phone375: { name: "Phone 375 (iPhone SE/mini)", styles: { width: "375px", height: "667px" }, type: "mobile" },
        phone430: { name: "Phone 430 (iPhone Pro Max)", styles: { width: "430px", height: "932px" }, type: "mobile" },
      },
    },
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
      // `bare` stories (full-screen phone layouts) render edge to edge.
      if (ctx.parameters.bare) {
        return (
          <div data-theme={theme} style={{ background: "var(--bg)", color: "var(--text)", height: "100dvh" }}>
            <Story />
          </div>
        );
      }
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
