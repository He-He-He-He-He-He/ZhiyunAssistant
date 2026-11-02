// One semantic icon vocabulary, with geometry and finish selected by the theme.
const paths = {
 settings:'M20.87 9.57 L21.14 10.99 L19.60 12.24 L19.47 13.42 L19.99 16.56 L19.18 17.75 L17.20 17.54 L16.27 18.29 L14.43 20.87 L13.01 21.14 L11.76 19.60 L10.58 19.47 L7.44 19.99 L6.25 19.18 L6.46 17.20 L5.71 16.27 L3.13 14.43 L2.86 13.01 L4.40 11.76 L4.53 10.58 L4.01 7.44 L4.82 6.25 L6.80 6.46 L7.73 5.71 L9.57 3.13 L10.99 2.86 L12.24 4.40 L13.42 4.53 L16.56 4.01 L17.75 4.82 L17.54 6.80 L18.29 7.73Z M15.3 12a3.3 3.3 0 1 1-6.6 0 3.3 3.3 0 0 1 6.6 0',
 history:'M3 11a9 9 0 1 1 2.7 7.4M3 4v7h7M12 7v5l3 2',
 send:'m3 4 19 8-19 8 3-8Zm3 8h16',
 key:'M12.5 11.5 3 21m0-4v4h4M21 8a5 5 0 1 1-10 0 5 5 0 0 1 10 0M16 8h.1',
 expand:'M14 3h7v7M21 3l-8 8M10 21H3v-7m0 7 8-8',
 stop:'M6 6h12v12H6Z',

 agent:'M4 4h16v13H9l-5 4Z M8 9h8m-8 4h5',
 crop:'M7 3v14h14M3 7h14v14',
 duplicates:'M8 3h13v13H8Z M3 8v13h13M12 7h5m-5 4h5',
 skip:'m4 5 8 7-8 7Z M16 5v14M21 5v14',
 smartSkip:'M4 6h7m-7 6h5m-5 6h7M17 3l1.5 5L22.5 10l-4.5 2-1.5 5-1.5-5L11 10l4.5-2Z',
 follow:'M12 3v18m-5-5 5 5 5-5M5 3h14',
 overview:'M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z',
 time:'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 page:'M5 3h10l4 4v14H5Z M14 3v5h5M9 12h6m-6 4h6',
 download:'M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4',
 notes:'M5 3h14v18H5Z M9 7h6m-6 5h6m-6 5h4',
 home:'M3 10.5 12 3l9 7.5V21H3Z M9 21v-7h6v7',
 favourite:'m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z',
 later:'M12 7v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 offline:'M12 3v12m-4-4 4 4 4-4 M4 16v5h16v-5',
 noteManager:'M5 3h11l3 3v15H5Z M9 10h6m-6 4h6m-6 4h4',
 cache:'M4 7h16v14H4Z M3 3h18v4H3Z M9 11h6',
 plaza:'M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z',
 book:'M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Zm0 0v15',
 themes:'M3 5h8v8H3Z M15 3h6v6h-6Z M15 13h6v8h-6Z M3 17h8v4H3Z',
 calendar:'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z M7 3v4m10-4v4M3 10h18M7 14h3m4 0h3m-10 3h3',
 previous:'m14.5 6-6 6 6 6', next:'m9.5 6 6 6-6 6',
 previousYear:'m12 6-6 6 6 6m6-12-6 6 6 6', nextYear:'m6 6 6 6-6 6m6-12 6 6-6 6',
 close:'m6 6 12 12M18 6 6 18',
 refresh:'M20 8a8.5 8.5 0 1 0 .2 7M20 3v5h-5',
 back:'M20 12H4m6-6-6 6 6 6',
 export:'M12 15V3m-4 4 4-4 4 4M4 14v7h16v-7',
 layout:'M3 4h18v16H3Z M11 4v16m0-8h10',
 slides:'M3 4h18v15H3Z M7 15l4-5 3 3 2-2 3 4M7 8h.1',
 transcript:'M4 5h16M4 10h12M4 15h16M4 20h9',
 video:'M3 6h12v12H3Z m12 4 6-3v10l-6-3',
 question:'M4 4h16v13H9l-5 4Z M8 9h8m-8 4h5',
 summary:'M5 3h14v18H5Z M9 7h6m-6 5h6m-6 5h4',
 search:'M16 16l5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 grip:'M6 7h12M6 12h12M6 17h12', check:'m5 12 4 4L19 6',
 alignLeft:'M4 5h16M4 10h11M4 15h16M4 20h11',alignCenter:'M4 5h16M7 10h10M4 15h16M7 20h10',alignRight:'M4 5h16M9 10h11M4 15h16M9 20h11',
 plus:'M12 5v14M5 12h14',minus:'M5 12h14',
 pause:'M8 5v14M16 5v14', play:'m7 4 13 8-13 8Z',
 trash:'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6m4-6v6',
 info:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 11v6m0-9.5h.01',
 shield:'M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6Zm-3.5 9 2.5 2.5 4.5-5',
 lock:'M5.5 11h13v10h-13Z M8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 15v2',
 edit:'M4 20h4.5L19.5 9 15 4.5 4 15.5Z M12.5 7l4.5 4.5',
 manage:'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
 image:'M4 5h16v14H4Z M4 16l5-5 4 4 2.5-2.5L20 17M15.5 9.5h.01',
 palette:'M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.9-.8 1.9-1.7 0-.5-.2-.9-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1 .8-1.7 1.8-1.7h2.1a3.7 3.7 0 0 0 3.7-3.7c0-4-3.8-7.3-8.5-7.3ZM7.8 12h.01M9.5 8h.01M14.5 8h.01',
};
// 晴空 draws its own family: a soft fill under a rounded 1.75 stroke, with solid accents for small details.
const sky = {
 settings:{"fill":"M10.43 5.18 L10.56 2.91 L13.44 2.91 L13.57 5.18 L15.71 6.06 L17.41 4.56 L19.44 6.59 L17.94 8.29 L18.82 10.43 L21.09 10.56 L21.09 13.44 L18.82 13.57 L17.94 15.71 L19.44 17.41 L17.41 19.44 L15.71 17.94 L13.57 18.82 L13.44 21.09 L10.56 21.09 L10.43 18.82 L8.29 17.94 L6.59 19.44 L4.56 17.41 L6.06 15.71 L5.18 13.57 L2.91 13.44 L2.91 10.56 L5.18 10.43 L6.06 8.29 L4.56 6.59 L6.59 4.56 L8.29 6.06Z M15.1 12a3.1 3.1 0 1 1-6.2 0 3.1 3.1 0 0 1 6.2 0Z","line":"M10.43 5.18 L10.56 2.91 L13.44 2.91 L13.57 5.18 L15.71 6.06 L17.41 4.56 L19.44 6.59 L17.94 8.29 L18.82 10.43 L21.09 10.56 L21.09 13.44 L18.82 13.57 L17.94 15.71 L19.44 17.41 L17.41 19.44 L15.71 17.94 L13.57 18.82 L13.44 21.09 L10.56 21.09 L10.43 18.82 L8.29 17.94 L6.59 19.44 L4.56 17.41 L6.06 15.71 L5.18 13.57 L2.91 13.44 L2.91 10.56 L5.18 10.43 L6.06 8.29 L4.56 6.59 L6.59 4.56 L8.29 6.06Z M15.1 12a3.1 3.1 0 1 1-6.2 0 3.1 3.1 0 0 1 6.2 0Z","evenodd":true},
 history:{"fill":"M19.5 12a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z","line":"M4.5 12a7.5 7.5 0 1 0 2.2-5.3 M4.5 4.8v3.5H8 M12 8.2v4l2.8 1.8"},
 send:{"fill":"M20.6 3.4 3.6 10.4c-.6.25-.55 1.1.07 1.3l6.4 2.1 2.1 6.4c.2.62 1.05.67 1.3.07Z","line":"M20.6 3.4 3.6 10.4c-.6.25-.55 1.1.07 1.3l6.4 2.1 2.1 6.4c.2.62 1.05.67 1.3.07Z M10.1 13.9l4.6-4.6"},
 key:{"fill":"M20.5 8.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z","line":"M20.5 8.5a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z M12.8 11.7 4 20.5 M6.6 17.9l2.3 2.3 M9.2 15.3l1.8 1.8","solid":"M17.2 8.5a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z"},
 expand:{"line":"M14 4h6v6 M20 4l-7.5 7.5 M10 20H4v-6 M4 20l7.5-7.5"},
 stop:{"solid":"M7.5 6h9A1.5 1.5 0 0 1 18 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 16.5v-9A1.5 1.5 0 0 1 7.5 6Z"},
 agent:{"fill":"M6 4.5h12A2.5 2.5 0 0 1 20.5 7v8a2.5 2.5 0 0 1-2.5 2.5h-5.2L8.5 20.7v-3.2H6A2.5 2.5 0 0 1 3.5 15V7A2.5 2.5 0 0 1 6 4.5Z","line":"M6 4.5h12A2.5 2.5 0 0 1 20.5 7v8a2.5 2.5 0 0 1-2.5 2.5h-5.2L8.5 20.7v-3.2H6A2.5 2.5 0 0 1 3.5 15V7A2.5 2.5 0 0 1 6 4.5Z","solid":"M12 7.4l0.94 2.66 2.66 0.94-2.66 0.94-0.94 2.66-0.94-2.66-2.66-0.94 2.66-0.94Z"},
 question:{"fill":"M6 4.5h12A2.5 2.5 0 0 1 20.5 7v8a2.5 2.5 0 0 1-2.5 2.5h-5.2L8.5 20.7v-3.2H6A2.5 2.5 0 0 1 3.5 15V7A2.5 2.5 0 0 1 6 4.5Z","line":"M6 4.5h12A2.5 2.5 0 0 1 20.5 7v8a2.5 2.5 0 0 1-2.5 2.5h-5.2L8.5 20.7v-3.2H6A2.5 2.5 0 0 1 3.5 15V7A2.5 2.5 0 0 1 6 4.5Z M10.1 9.3a2 2 0 1 1 2.75 1.85c-.5.2-.85.6-.85 1.15v.45 M12 14.6h.01"},
 crop:{"fill":"M7 7h10v10H7Z","line":"M7 3.5v12A1.5 1.5 0 0 0 8.5 17h12 M3.5 7h12A1.5 1.5 0 0 1 17 8.5v12"},
 duplicates:{"fill":"M9.5 7.5h9A1.5 1.5 0 0 1 20 9v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 18V9a1.5 1.5 0 0 1 1.5-1.5Z","line":"M9.5 7.5h9A1.5 1.5 0 0 1 20 9v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 18V9a1.5 1.5 0 0 1 1.5-1.5Z M4.5 15.5v-9A2 2 0 0 1 6.5 4.5h9"},
 skip:{"fill":"M5.5 6.4v11.2a.9.9 0 0 0 1.38.76l8.6-5.6a.9.9 0 0 0 0-1.52l-8.6-5.6a.9.9 0 0 0-1.38.76Z","line":"M5.5 6.4v11.2a.9.9 0 0 0 1.38.76l8.6-5.6a.9.9 0 0 0 0-1.52l-8.6-5.6a.9.9 0 0 0-1.38.76Z M19 5.5v13"},
 smartSkip:{"line":"M4 6.5h7 M4 12h5 M4 17.5h7","solid":"M17 4.4l1.20 3.40 3.40 1.20-3.40 1.20-1.20 3.40-1.20-3.40-3.40-1.20 3.40-1.20Z"},
 follow:{"line":"M12 4v12 M7.2 11.2 12 16l4.8-4.8 M5 20h14"},
 overview:{"fill":"M5.5 4h3A1.5 1.5 0 0 1 10 5.5v3A1.5 1.5 0 0 1 8.5 10h-3A1.5 1.5 0 0 1 4 8.5v-3A1.5 1.5 0 0 1 5.5 4Z M15.5 14h3A1.5 1.5 0 0 1 20 15.5v3A1.5 1.5 0 0 1 18.5 20h-3A1.5 1.5 0 0 1 14 18.5v-3A1.5 1.5 0 0 1 15.5 14Z","line":"M5.5 4h3A1.5 1.5 0 0 1 10 5.5v3A1.5 1.5 0 0 1 8.5 10h-3A1.5 1.5 0 0 1 4 8.5v-3A1.5 1.5 0 0 1 5.5 4Z M15.5 4h3A1.5 1.5 0 0 1 20 5.5v3A1.5 1.5 0 0 1 18.5 10h-3A1.5 1.5 0 0 1 14 8.5v-3A1.5 1.5 0 0 1 15.5 4Z M5.5 14h3A1.5 1.5 0 0 1 10 15.5v3A1.5 1.5 0 0 1 8.5 20h-3A1.5 1.5 0 0 1 4 18.5v-3A1.5 1.5 0 0 1 5.5 14Z M15.5 14h3A1.5 1.5 0 0 1 20 15.5v3A1.5 1.5 0 0 1 18.5 20h-3A1.5 1.5 0 0 1 14 18.5v-3A1.5 1.5 0 0 1 15.5 14Z"},
 time:{"fill":"M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z","line":"M12 8v4.2l2.6 1.6 M19.5 12a7.5 7.5 0 1 1-2.2-5.3 M19.5 4.5v3.3h-3.3"},
 later:{"fill":"M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z","line":"M12 7.8V12l2.8 1.8 M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z"},
 page:{"fill":"M7 3.5h10A1.5 1.5 0 0 1 18.5 5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z","line":"M7 3.5h10A1.5 1.5 0 0 1 18.5 5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z M9 8.5h6 M9 12h6 M9 15.5h3.5"},
 download:{"fill":"M4.5 14.5h15v3A2.5 2.5 0 0 1 17 20H7a2.5 2.5 0 0 1-2.5-2.5Z","line":"M12 4v10.5 M7.8 10.3 12 14.5l4.2-4.2 M4.5 14.5v3A2.5 2.5 0 0 0 7 20h10a2.5 2.5 0 0 0 2.5-2.5v-3"},
 offline:{"fill":"M7 17.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6-1.2A4.4 4.4 0 0 1 17.5 17.5Z","line":"M7 17.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6-1.2A4.4 4.4 0 0 1 17.5 17.5 M12 11.5v8 M9.3 16.8 12 19.5l2.7-2.7"},
 notes:{"fill":"M7 3.5h7l4.5 4.5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z","line":"M7 3.5h7l4.5 4.5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z M14 3.5V8h4.5 M8.5 12h7 M8.5 15.5h5"},
 home:{"fill":"M4 10.3 12 4l8 6.3V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z","line":"M4 10.3 12 4l8 6.3V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19Z M10 20.5v-5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"},
 favourite:{"fill":"M12 3.8l2.45 4.95 5.45.8-3.95 3.85.93 5.43L12 16.27l-4.88 2.56.93-5.43L4.1 9.55l5.45-.8Z","line":"M12 3.8l2.45 4.95 5.45.8-3.95 3.85.93 5.43L12 16.27l-4.88 2.56.93-5.43L4.1 9.55l5.45-.8Z"},
 noteManager:{"fill":"M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l1.8 2H19A1.5 1.5 0 0 1 20.5 9v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18Z","line":"M3.5 7A1.5 1.5 0 0 1 5 5.5h4.2l1.8 2H19A1.5 1.5 0 0 1 20.5 9v9a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18Z M8 12.5h8 M8 15.5h5"},
 cache:{"fill":"M4 7.6 12 3.6l8 4-8 4Z","line":"M4 7.6 12 3.6l8 4v8.8L12 20.4l-8-4Z M4 7.6l8 4 8-4 M12 11.6v8.8"},
 plaza:{"fill":"M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z","line":"M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z","solid":"M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1Z"},
 book:{"fill":"M12 6.5C10.2 5.2 7.7 4.6 4.5 5v13c3.2-.4 5.7.2 7.5 1.5 1.8-1.3 4.3-1.9 7.5-1.5V5c-3.2-.4-5.7.2-7.5 1.5Z","line":"M12 6.5C10.2 5.2 7.7 4.6 4.5 5v13c3.2-.4 5.7.2 7.5 1.5 1.8-1.3 4.3-1.9 7.5-1.5V5c-3.2-.4-5.7.2-7.5 1.5Z M12 6.5v13"},
 themes:{"fill":"M12 3.5a8.5 8.5 0 1 0 0 17c1.15 0 1.85-.8 1.85-1.7 0-.45-.2-.85-.5-1.25-.3-.4-.5-.8-.5-1.25 0-1 .8-1.7 1.8-1.7h2.05A3.8 3.8 0 0 0 20.5 10.8C20.5 6.8 16.7 3.5 12 3.5Z","line":"M12 3.5a8.5 8.5 0 1 0 0 17c1.15 0 1.85-.8 1.85-1.7 0-.45-.2-.85-.5-1.25-.3-.4-.5-.8-.5-1.25 0-1 .8-1.7 1.8-1.7h2.05A3.8 3.8 0 0 0 20.5 10.8C20.5 6.8 16.7 3.5 12 3.5Z","solid":"M8.8 12a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z M10.5 8a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z M15.8 8a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z"},
 palette:{"fill":"M12 3.5a8.5 8.5 0 1 0 0 17c1.15 0 1.85-.8 1.85-1.7 0-.45-.2-.85-.5-1.25-.3-.4-.5-.8-.5-1.25 0-1 .8-1.7 1.8-1.7h2.05A3.8 3.8 0 0 0 20.5 10.8C20.5 6.8 16.7 3.5 12 3.5Z","line":"M12 3.5a8.5 8.5 0 1 0 0 17c1.15 0 1.85-.8 1.85-1.7 0-.45-.2-.85-.5-1.25-.3-.4-.5-.8-.5-1.25 0-1 .8-1.7 1.8-1.7h2.05A3.8 3.8 0 0 0 20.5 10.8C20.5 6.8 16.7 3.5 12 3.5Z","solid":"M8.8 12a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z M10.5 8a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z M15.8 8a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0Z"},
 calendar:{"fill":"M6 5h12A2 2 0 0 1 20 7v3H4V7A2 2 0 0 1 6 5Z","line":"M6 5h12A2 2 0 0 1 20 7v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z M8 3v4 M16 3v4 M4 10h16","solid":"M7.6 13.4h1.8v1.8H7.6Z M11.1 13.4h1.8v1.8h-1.8Z M14.6 13.4h1.8v1.8h-1.8Z M7.6 16.6h1.8v1.8H7.6Z"},
 previous:{"line":"M14.5 6l-6 6 6 6"},
 next:{"line":"M9.5 6l6 6-6 6"},
 previousYear:{"line":"M12 6l-6 6 6 6 M18 6l-6 6 6 6"},
 nextYear:{"line":"M6 6l6 6-6 6 M12 6l6 6-6 6"},
 close:{"line":"M7 7l10 10 M17 7 7 17"},
 refresh:{"line":"M19.5 12a7.5 7.5 0 1 1-2.2-5.3 M19.5 4.5v3.8h-3.8"},
 back:{"line":"M19 12H5 M11 6l-6 6 6 6"},
 export:{"fill":"M5 13h14v4.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 17.5Z","line":"M12 14.5V4 M8 8l4-4 4 4 M5 12v5.5A2.5 2.5 0 0 0 7.5 20h9a2.5 2.5 0 0 0 2.5-2.5V12"},
 layout:{"fill":"M5.5 4h5v16h-5A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4Z","line":"M5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-13A1.5 1.5 0 0 1 5.5 4Z M10.5 4v16 M10.5 12H20"},
 slides:{"fill":"M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9.5A1.5 1.5 0 0 1 19 17H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5Z","line":"M5 4.5h14A1.5 1.5 0 0 1 20.5 6v9.5A1.5 1.5 0 0 1 19 17H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5Z M12 17v3 M8.5 20.5h7 M7 13.5l3-3.5 2.4 2.4 2.1-2.1 2.5 3.2","solid":"M9.6 8.2a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0Z"},
 transcript:{"line":"M4 6.5h11 M4 11h13 M4 15.5h8 M15.5 15.5v3 M18.5 13.5v7 M21 16v2"},
 video:{"fill":"M5 6h9A1.5 1.5 0 0 1 15.5 7.5v9A1.5 1.5 0 0 1 14 18H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 6Z","line":"M5 6h9A1.5 1.5 0 0 1 15.5 7.5v9A1.5 1.5 0 0 1 14 18H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 6Z M15.5 10.2l4.2-2.6a.6.6 0 0 1 .9.5v7.8a.6.6 0 0 1-.9.5l-4.2-2.6"},
 summary:{"fill":"M7 3.5h7l4.5 4.5V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5Z","line":"M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h6 M14 3.5l4.5 4.5v2.5 M14 3.5V8h4.5 M8.5 12h5 M8.5 15.5h3","solid":"M17.6 12.0l1.09 3.11 3.11 1.09-3.11 1.09-1.09 3.11-1.09-3.11-3.11-1.09 3.11-1.09Z"},
 search:{"fill":"M17.5 10.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z","line":"M17.5 10.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z M15.6 15.6 20.5 20.5"},
 grip:{"line":"M9 6.5h.01 M9 12h.01 M9 17.5h.01 M15 6.5h.01 M15 12h.01 M15 17.5h.01","heavy":true},
 check:{"line":"M5 12.5l4.5 4.5L19 7.5"},
 alignLeft:{"line":"M4 5.5h16 M4 10h11 M4 14.5h16 M4 19h11"},
 alignCenter:{"line":"M4 5.5h16 M6.5 10h11 M4 14.5h16 M6.5 19h11"},
 alignRight:{"line":"M4 5.5h16 M9 10h11 M4 14.5h16 M9 19h11"},
 plus:{"line":"M12 5v14 M5 12h14"},
 minus:{"line":"M5 12h14"},
 pause:{"solid":"M8 5h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z M14 5h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"},
 play:{"solid":"M8 5.6v12.8a.9.9 0 0 0 1.37.77l10.2-6.4a.9.9 0 0 0 0-1.54L9.37 4.83A.9.9 0 0 0 8 5.6Z"},
 trash:{"fill":"M6.5 7h11l-.85 11.6A1.5 1.5 0 0 1 15.15 20h-6.3a1.5 1.5 0 0 1-1.5-1.4Z","line":"M4.5 7h15 M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7 M6.5 7l.85 11.6A1.5 1.5 0 0 0 8.85 20h6.3a1.5 1.5 0 0 0 1.5-1.4L17.5 7 M10 11v5 M14 11v5"},
 info:{"fill":"M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z","line":"M20.5 12a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z M12 11v5.5","solid":"M13 7.9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"},
 shield:{"fill":"M12 3.5l7 2.8v5.2c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6.3Z","line":"M12 3.5l7 2.8v5.2c0 4.4-3 7.7-7 9-4-1.3-7-4.6-7-9V6.3Z M8.8 12l2.3 2.3 4.2-4.6"},
 lock:{"fill":"M7 10.5h10a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19v-7A1.5 1.5 0 0 1 7 10.5Z","line":"M7 10.5h10a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19v-7A1.5 1.5 0 0 1 7 10.5Z M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5 M12 14.5v2"},
 edit:{"fill":"M5 19l.8-3.6L15.4 5.8a2 2 0 0 1 2.8 2.8L8.6 18.2Z","line":"M5 19l.8-3.6L15.4 5.8a2 2 0 0 1 2.8 2.8L8.6 18.2Z M13.8 7.4l2.8 2.8"},
 manage:{"line":"M9.5 6.5h10 M9.5 12h10 M9.5 17.5h10 M5 6.5h.01 M5 12h.01 M5 17.5h.01","heavy":true},
 image:{"fill":"M5.5 4.5h13A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V6a1.5 1.5 0 0 1 1.5-1.5Z","line":"M5.5 4.5h13A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18V6a1.5 1.5 0 0 1 1.5-1.5Z M4 15.5l4.2-4.2 3.6 3.6 2.4-2.4 5.8 5.8","solid":"M16.6 8.6a1.4 1.4 0 1 1-2.8 0 1.4 1.4 0 0 1 2.8 0Z"},
};
function skySvg(g) {
 const fill=g.fill?'<path class="i-fill" d="'+g.fill+'" fill="currentColor" stroke="none"'+(g.evenodd?' fill-rule="evenodd"':'')+'/>':'';
 const line=g.line?'<path d="'+g.line+'"/>':'';
 const solid=g.solid?'<path class="i-solid" d="'+g.solid+'" fill="currentColor" stroke="none"/>':'';
 return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+(g.heavy?2.4:1.75)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+fill+line+solid+'</svg>';
}
const profiles = {
 collage:['paper',1.65,'round'], playful:['soft',1.8,'round'], press:['editorial',1.5,'square'],
 acid:['signal',1.8,'square'], bauhaus:['geometry',2,'square'], candy:['soft',1.9,'round'],
 terminal:['technical',1.35,'square'], swiss:['geometry',2.1,'square'], field:['organic',1.65,'round'],
 film:['editorial',1.5,'round'], workshop:['technical',1.6,'square'], post:['paper',1.5,'round'],
 memphis:['geometry',2,'round'], retro:['pixel',1.4,'square'], glass:['soft',1.3,'round'],
 marginalia:['editorial',1.25,'round'], metro:['signal',2.2,'round'], sketch:['organic',1.9,'round'],
 racing:['signal',2.2,'square'], gallery:['editorial',1.2,'square'],
};
const calendars = {
 paper:'M4 6h16v15H4Z M7 3v6m10-6v6M4 11h16M8 15h2m4 0h2m-8 3h2',
 soft:'M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z M8 3v5m8-5v5M3 11h18m-13 4h2m4 0h2',
 editorial:'M4 5h16v16H4Z M7 2v6m10-6v6M4 10h16m-12 4h3m3 0h2m-8 3h3',
 signal:'M3 6h18v15H3Z M7 3v6m10-6v6M3 11h18M7 15h3v3H7Z m7 0h3v3h-3Z',
 geometry:'M3 6h18v15H3Z M7 3v6m10-6v6M3 11h18M7 15h3m4 0h3m-10 3h3m4 0h3',
 technical:'M3 5h18v16H3Z M7 2v6m10-6v6M3 10h18M8 14v4m4-4v4m4-4v4M6 16h12',
 organic:'M4 6 20 5l1 15-17 1Z M7 3l.5 6m9.5-6v6M4 11l16-1M8 15l3-.2m3-.1 2 .1m-8 3 3-.1',
 pixel:'M5 5h14v2h2v12h-2v2H5v-2H3V7h2Z M7 3v6m10-6v6M3 11h18M7 15h3m4 0h3m-10 3h3',
};
function geometry(name, theme) {
 const [family,width,cap]=profiles[theme]||profiles.collage;
 let d=paths[name]||paths.book;
 if(name==='calendar')d=calendars[family];
 if(['previous','next','previousYear','nextYear'].includes(name)) {
  const right=name.startsWith('next'),double=name.endsWith('Year');
  if(family==='technical'||family==='signal')d=(right?'M4 12h15m-5-6 6 6-6 6':'M20 12H5m5-6-6 6 6 6')+(double?(right?'M22 6v12':'M2 6v12'):'');
  if(family==='pixel')d=(right?'M8 5v3h3v3h3v2h-3v3H8v3':'M16 5v3h-3v3h-3v2h3v3h3v3')+(double?(right?'M19 5v14':'M5 5v14'):'');
  if(family==='organic')d=right?'m9 5 7 6.5L10 19':'m15 5-7 7 6.5 7';
  if(double&&family==='organic')d+=right?'M19 5v14':'M5 5v14';
 }
 return{family,width,cap,d};
}
export const iconNames = Object.freeze(Object.keys(paths));
export function refreshThemeIcons(root=document) {
 const theme=document.documentElement.dataset.theme||'collage';
 root.querySelectorAll('[data-ui-icon]').forEach(node=>{
  if(node.dataset.iconTheme===theme)return;
  if(theme==='collage'&&sky[node.dataset.uiIcon]){node.dataset.iconTheme=theme;node.dataset.iconFamily='sky';node.innerHTML=skySvg(sky[node.dataset.uiIcon]);return;}
  const g=geometry(node.dataset.uiIcon,theme);node.dataset.iconTheme=theme;node.dataset.iconFamily=g.family;
  node.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+g.width+'" stroke-linecap="'+g.cap+'" stroke-linejoin="'+(g.cap==='round'?'round':'miter')+'" aria-hidden="true"><path d="'+g.d+'"/></svg>';
 });
}
export function makeIcon(name, doc=document) {
 const node=doc.createElement('span');node.className='design-icon ui-icon';node.dataset.uiIcon=name;node.setAttribute('aria-hidden','true');
 const host=doc.createElement('div');host.append(node);refreshThemeIcons(host);return node;
}
const actions={'刷新':'refresh','批量下载':'offline','选择日期':'calendar','返回':'back','返回课堂':'back','导出':'export','下载课程':'offline','布局':'layout','概览':'slides','跳转时间':'later','跳转页数':'book','发送':'send','功能':'layout','打开我的笔记':'noteManager','发现更多课程':'plaza','管理':'manage',
 '重命名':'edit','新对话':'plus','历史':'history','API设置':'settings','选课件':'slides','最新':'follow','重试':'refresh','图片':'image','新建':'plus','颜色':'palette','设置':'settings','批量导出':'export'};
export function decorateAction(button, label=button.textContent) {
 const name=actions[label]||(/^\d{4}-\d{2}-\d{2}$/.test(label)?"calendar":null);if(name&&!button.querySelector('.ui-icon')){button.prepend(makeIcon(name));if(!button.title)button.title=label;}return button;
}
