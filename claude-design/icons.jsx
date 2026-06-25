/* Fuchine — icon set (stroke, refined, 1.6px) */
const Ic = {};
const mk = (paths, fill) => (props) => (
  <svg viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'}
       strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" {...props}>
    {paths}
  </svg>
);

Ic.home = mk(<><path d="M3.5 10.2 12 3.5l8.5 6.7"/><path d="M5.5 9v10.5h13V9"/></>);
Ic.library = mk(<><rect x="3.5" y="4.5" width="7" height="15" rx="1.4"/><rect x="13.5" y="4.5" width="7" height="9.5" rx="1.4"/><path d="M13.5 17.5h7"/></>);
Ic.review = mk(<><path d="M20 7.5A8 8 0 1 0 21 12"/><path d="M20 4v3.5h-3.5"/></>);
Ic.settings = mk(<><circle cx="12" cy="12" r="2.6"/><path d="M12 3.5v2M12 18.5v2M4.7 7.2l1.7 1M17.6 15.8l1.7 1M3.5 12h2M18.5 12h2M4.7 16.8l1.7-1M17.6 8.2l1.7-1"/></>);
Ic.dict = mk(<><path d="M5 4.5h11a2 2 0 0 1 2 2v13H7a2 2 0 0 1-2-2z"/><path d="M5 17.5h13"/><path d="M9 8.5h5"/></>);
Ic.phrases = mk(<><path d="M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H9l-4 3v-3a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z"/></>);
Ic.albums = mk(<><rect x="3.5" y="4.5" width="11" height="11" rx="1.5"/><path d="M7.5 8.5h13a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 8 18z"/></>);
Ic.stats = mk(<><path d="M4 19.5h16"/><path d="M7 19.5v-7M12 19.5V6M17 19.5v-4"/></>);
Ic.chevron = mk(<><path d="M14.5 6.5 9 12l5.5 5.5"/></>);
Ic.play = mk(<path d="M8 5.5v13l11-6.5z"/>, true);
Ic.youtube = mk(<><rect x="2.5" y="5.5" width="19" height="13" rx="3.5"/><path d="M10 9.2v5.6l5-2.8z" fill="currentColor" stroke="none"/></>);
Ic.plus = mk(<><path d="M12 5v14M5 12h14"/></>);
Ic.check = mk(<><path d="M5 12.5 10 17.5 19 7"/></>);
Ic.arrow = mk(<><path d="M5 12h14M13 6l6 6-6 6"/></>);
Ic.spark = mk(<><path d="M12 4l1.8 4.7L18.5 10l-4.7 1.3L12 16l-1.8-4.7L5.5 10l4.7-1.3z"/></>);
Ic.close = mk(<><path d="M6 6l12 12M18 6 6 18"/></>);
Ic.alert = mk(<><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5"/><path d="M12 16h.01"/></>);
Ic.caption = mk(<><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M7 11.5h2.5M7 14.5h4"/><path d="M13.5 11.5H17M13.5 14.5h2"/></>);
Ic.clock = mk(<><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/></>);
Ic.chevDown = mk(<><path d="M6 9.5 12 15.5l6-6"/></>);
Ic.refresh = mk(<><path d="M20 7.5A8 8 0 1 0 21 12"/><path d="M20 4v3.5h-3.5"/></>);

Ic.pause = mk(<><rect x="7" y="5" width="3.4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.6" y="5" width="3.4" height="14" rx="1" fill="currentColor" stroke="none"/></>);
Ic.rewind = mk(<><path d="M11 7 5 12l6 5z" fill="currentColor" stroke="none"/><path d="M19 7l-6 5 6 5z" fill="currentColor" stroke="none"/></>);
Ic.forward = mk(<><path d="M13 7l6 5-6 5z" fill="currentColor" stroke="none"/><path d="M5 7l6 5-6 5z" fill="currentColor" stroke="none"/></>);
Ic.volume = mk(<><path d="M4 9.5h3L11 6v12L7 14.5H4z"/><path d="M14.5 9.2a4 4 0 0 1 0 5.6"/><path d="M16.8 7a7 7 0 0 1 0 10"/></>);
Ic.fullscreen = mk(<><path d="M4 9V5.5a1 1 0 0 1 1-1H8.5"/><path d="M20 9V5.5a1 1 0 0 0-1-1H15.5"/><path d="M4 15v3.5a1 1 0 0 0 1 1H8.5"/><path d="M20 15v3.5a1 1 0 0 1-1 1H15.5"/></>);
Ic.loop = mk(<><path d="M17 4.5 20 7.5l-3 3"/><path d="M20 7.5H8.5A4.5 4.5 0 0 0 4 12"/><path d="M7 19.5 4 16.5l3-3"/><path d="M4 16.5h11.5A4.5 4.5 0 0 0 20 12"/></>);
Ic.bookmark = mk(<><path d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1Z"/></>);
Ic.bookmarkFill = mk(<><path d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1Z" fill="currentColor" stroke="none"/></>);
Ic.search = mk(<><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l4.5 4.5"/></>);
Ic.filter = mk(<><path d="M4 6.5h16"/><path d="M7 12h10"/><path d="M10 17.5h4"/></>);
Ic.more = mk(<><circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/></>);
Ic.eyeOff = mk(<><path d="M4 4l16 16"/><path d="M9.9 5.4A8.6 8.6 0 0 1 12 5.2c5 0 8.5 4.4 8.5 6.8a10 10 0 0 1-2.2 3"/><path d="M6.4 7.1C4.2 8.4 2.5 10.6 2.5 12c0 2.4 3.5 6.8 9.5 6.8a9.3 9.3 0 0 0 3.6-0.7"/><path d="M9.8 9.9a3 3 0 0 0 4.1 4.1"/></>);
Ic.folderPlus = mk(<><path d="M3.5 7.5a1.5 1.5 0 0 1 1.5-1.5h3.6l2 2.4H19a1.5 1.5 0 0 1 1.5 1.5v7.6a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M12 11.6v4.2M9.9 13.7h4.2"/></>);
Ic.download = mk(<><path d="M12 4v10"/><path d="M8 10.5l4 4 4-4"/><path d="M5 19.5h14"/></>);
Ic.sort = mk(<><path d="M7 5v14"/><path d="M4 16l3 3 3-3"/><path d="M14 7h6M14 12h4M14 17h2"/></>);
Ic.flag = mk(<><path d="M6 4v16"/><path d="M6 5h11l-2 3.2L17 11H6"/></>);
Ic.list = mk(<><path d="M8 6.5h12M8 12h12M8 17.5h12"/><path d="M4 6.5h.01M4 12h.01M4 17.5h.01"/></>);
Ic.cards = mk(<><rect x="3.5" y="7" width="12" height="12" rx="1.6"/><path d="M7 4.5h11a1.5 1.5 0 0 1 1.5 1.5v11"/></>);
Ic.text = mk(<><path d="M5 7V5.5h14V7"/><path d="M12 5.5v13"/><path d="M9.5 18.5h5"/></>);
Ic.kana = mk(<><rect x="3.5" y="3.5" width="17" height="17" rx="3.4"/><path d="M8 9.6c1.8.2 4.6.2 6.4-.1"/><path d="M12.7 8.2c-.4 3.2-1.9 5.6-4.1 6.9"/><path d="M12.6 11.8c1.6.9 2.7 2.1 2.7 3.2 0 .9-.6 1.4-1.5 1.3"/></>);
Ic.flame = mk(<><path d="M12 3.4c2.8 3.1 5 5.3 5 8.7a5 5 0 0 1-10 0c0-1.4.5-2.5 1.4-3.4.2 1.1.9 1.8 1.9 2C9.3 8.4 10.3 6 12 3.4Z"/></>);
Ic.bolt = mk(<><path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/></>);
Ic.medal = mk(<><circle cx="12" cy="14.5" r="5"/><path d="M12 12.3v0M12 17v0"/><path d="M9 9.5 6.5 3.5M15 9.5 17.5 3.5"/></>);

window.Ic = Ic;
