import React from "react";
// One stroke family for the guest menu (24px grid, 2px round strokes).
const paths = {
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  bag: <><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  alert: <><path d="M12 8v5" /><path d="M12 16.5v.01" /></>,
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  grid: <><circle cx="6" cy="6" r="1.4" /><circle cx="12" cy="6" r="1.4" /><circle cx="18" cy="6" r="1.4" /><circle cx="6" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="18" cy="12" r="1.4" /><circle cx="6" cy="18" r="1.4" /><circle cx="12" cy="18" r="1.4" /><circle cx="18" cy="18" r="1.4" /></>,
  home: <><path d="M4 11 12 4l8 7" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></>,
  heart: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />,
  flame: <path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.4 2.6-5 3.4-8.4.9 1.4 1.4 2.7 1.4 4 1.3-.8 2.4-2.6 2.6-5 2.6 2.2 4.6 5.4 4.6 9.2C18 18.6 15.6 21 12 21Z" />,
  cup: <><path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8Z" /><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M8 3v2M11 3v2" /></>,
  layers: <><path d="m12 4 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4" /><path d="m4 16 8 4 8-4" /></>,
  wine: <><path d="M8 3h8l-.4 5a3.6 3.6 0 0 1-7.2 0L8 3Z" /><path d="M12 12v8M8.5 20h7" /></>,
  cocktail: <><path d="M4 5h16l-8 8-8-8Z" /><path d="M12 13v7M8.5 20h7" /><path d="M15 3.5 17.5 6" /></>,
  beer: <><path d="M6 7h9v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7Z" /><path d="M15 10h1.5a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H15" /><path d="M6 7a2.5 2.5 0 0 1 4-2 2.5 2.5 0 0 1 4 .5 2 2 0 0 1 1 1.5" /></>,
  bottle: <><path d="M10 3h4v3l1.5 3v10a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2V9L10 6V3Z" /><path d="M8.5 13h7" /></>,
  cake: <><path d="M4 20h16v-7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7Z" /><path d="M4 15c2 1.3 4 1.3 5.3 0 1.4 1.3 4 1.3 5.4 0 1.3 1.3 3.3 1.3 5.3 0" /><path d="M12 11V7" /><path d="M12 4.5v.01" /></>,
  pizza: <><path d="M12 21 3.5 6.5a17 17 0 0 1 17 0L12 21Z" /><path d="M5 9a14 14 0 0 1 14 0" /><path d="M10 12v.01M13.5 11v.01M12 15v.01" /></>,
  plate: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4.5" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
};
export function Icon({ name, size = 20, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}
