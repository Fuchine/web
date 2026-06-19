import type { Meta, StoryObj } from "@storybook/react";
import { ReviewDock } from "./ReviewDock";

const meta = {
  title: "Review/ReviewDock",
  component: ReviewDock,
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof ReviewDock>;

export default meta;
type Story = StoryObj<typeof meta>;

const defaultGrades = [
  { grade: 1 as const, label: "Again", when: "<1 min" },
  { grade: 2 as const, label: "Hard", when: "<10 min" },
  { grade: 3 as const, label: "Good", when: "1 day" },
  { grade: 4 as const, label: "Easy", when: "4 days" },
];

export const HiddenAnswer: Story = {
  args: {
    revealed: false,
    grades: defaultGrades,
    onShowAnswer: () => console.log("show answer"),
    onGrade: () => {},
  },
};

export const AnswerRevealed: Story = {
  args: {
    revealed: true,
    grades: defaultGrades,
    onShowAnswer: () => console.log("show answer"),
    onGrade: (grade: 1 | 2 | 3 | 4) => console.log("graded", grade),
  },
};
