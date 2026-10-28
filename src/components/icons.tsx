import type { SVGProps } from "react";

const paths: Record<string, string> = {
  home: "M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  users: "M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 21v-1a6 6 0 0116 0v1",
  bus: "M5 17h14M6 4h12a2 2 0 012 2v9H4V6a2 2 0 012-2zM4 11h16M7.5 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM16.5 20a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  plane: "M2 16l20-6-2-2-8 1.5L7 4 5 5l3 6-4 1-2-2-1 1 2.5 3.5L2 16z",
  hotel: "M3 21V6a1 1 0 011-1h9a1 1 0 011 1v15M14 10h6a1 1 0 011 1v10M3 21h18M7 9h3M7 13h3M7 17h3",
  wallet: "M3 7a2 2 0 012-2h13v4M3 7v10a2 2 0 002 2h14a1 1 0 001-1V9a1 1 0 00-1-1H5a2 2 0 01-2-1zM16 14h2",
  agent: "M12 12a4 4 0 100-8 4 4 0 000 8zM5 21v-1a7 7 0 0114 0v1M17 6l2 2 3-3",
  upload: "M12 16V4M7 9l5-5 5 5M4 20h16",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3zM9 12l2 2 4-4",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
  template: "M4 5h16v4H4zM4 13h7v6H4zM15 13h5v6h-5z",
  alert: "M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  check: "M5 12l5 5 9-10",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  search: "M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.3-4.3",
  plus: "M12 5v14M5 12h14",
  logout: "M15 4h4a1 1 0 011 1v14a1 1 0 01-1 1h-4M10 16l-4-4 4-4M6 12h10",
  inbox: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5",
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={paths[name]} />
    </svg>
  );
}
