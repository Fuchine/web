"use client";

import { useRouter } from "next/navigation";
import { Player, type PlayerProps } from "@fuchine/ui";

export function PlayerView(props: Omit<PlayerProps, "onBack" | "onNavigate">) {
  const router = useRouter();
  return (
    <Player
      {...props}
      onBack={() => router.push("/")}
      onNavigate={(key) => router.push(key === "library" ? "/" : `/${key}`)}
    />
  );
}
