const isWindows = /Win/i.test(navigator.platform || navigator.userAgent);

export const PATH_SEPARATOR = isWindows ? "\\" : "/";
