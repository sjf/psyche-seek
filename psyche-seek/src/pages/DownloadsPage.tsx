import { Download, Pause, Play, X } from "lucide-react";
import { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { PATH_SEPARATOR } from "../paths";
import { cancelPrewarm, prewarmUser } from "../prewarm";
import BroomIcon from "../components/BroomIcon";
import FileActionBar from "../components/FileActionBar";
import Modal from "../components/Modal";
import { useAuth } from "../state/auth";
import { Track, usePlayer } from "../state/player";
import { useToast } from "../state/toast";

interface DownloadItem {
  user: string;
  path: string;
  virtual_path?: string;
  size: number;
  offset: number;
  status: string;
  speed?: number;
  folder: string;
  isFolder?: boolean;
  local_path?: string | null;
  queued_at?: number;
}

type SortKey = "user" | "path" | "size" | "progress" | "status" | "queued_at";

type SortDirection = "asc" | "desc";

function formatSize(bytes: number) {
  if (!bytes) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[index]}`;
}

function getProgress(item: DownloadItem) {
  if (!item.size) {
    return 0;
  }
  return Math.min(100, Math.floor((item.offset / item.size) * 100));
}

function formatSpeed(item: DownloadItem) {
  if (!item.speed || item.status.toLowerCase() !== "transferring") {
    return "";
  }
  return `${formatSize(item.speed)}/s`;
}

function isFinished(status: string) {
  const value = status.toLowerCase();
  return value === "finished" || value === "completed";
}

function isPaused(status: string) {
  return status.toLowerCase() === "paused";
}

function shortRemotePath(path: string) {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts.slice(-2).join(PATH_SEPARATOR);
}

function formatStatus(status: string) {
  if (isFinished(status)) {
    return "Done";
  }
  const value = status.toLowerCase();
  if (value === "getting status") {
    return "Starting";
  }
  if (value === "transferring") {
    return "Downloading";
  }
  return status;
}

function getQueuedAtDate(timestamp?: number) {
  if (!timestamp) {
    return "-";
  }
  return new Date(timestamp * 1000).toLocaleDateString();
}

function getQueuedAtTimestamp(timestamp?: number) {
  if (!timestamp) {
    return undefined;
  }
  return new Date(timestamp * 1000).toLocaleString();
}

function SlideReveal({ closing, children }: { closing: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    if (closing) {
      el.style.height = `${el.scrollHeight}px`;
      void el.offsetHeight;
      el.style.height = "0px";
      el.style.opacity = "0";
      return;
    }
    const target = el.scrollHeight;
    el.style.height = "0px";
    el.style.opacity = "0";
    void el.offsetHeight;
    el.style.height = `${target}px`;
    el.style.opacity = "1";
    const settle = () => {
      el.style.height = "auto";
    };
    el.addEventListener("transitionend", settle);
    return () => el.removeEventListener("transitionend", settle);
  }, [closing]);

  return (
    <div ref={ref} className={`downloads-detail-anim${closing ? " closing" : ""}`}>
      {children}
    </div>
  );
}

export default function DownloadsPage() {
  const [items, setItems] = useState<DownloadItem[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("queued_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedItem, setSelectedItem] = useState<DownloadItem | null>(null);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showDelete, setShowDelete] = useState(false);
  const [confirmCancelItem, setConfirmCancelItem] = useState<DownloadItem | null>(null);
  const [closingItem, setClosingItem] = useState<DownloadItem | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [downloadsDir, setDownloadsDir] = useState("");
  const restoreSelectedRef = useRef(
    (() => {
      try {
        return window.sessionStorage.getItem("downloadsSelectedKey") || "";
      } catch {
        return "";
      }
    })()
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await apiFetch("/api/config/directories");
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as { download_dir?: string };
        if (active) {
          setDownloadsDir(data.download_dir || "");
        }
      } catch {
        // Leave the local path unlinked if the config is unavailable.
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  const navigate = useNavigate();
  const { playTrack, enqueue } = usePlayer();
  const { addToast } = useToast();
  const { localFiles } = useAuth();
  const deletePath = selectedItem
    ? String(selectedItem.local_path || selectedItem.path || "")
    : "";

  const refreshDownloads = useCallback(async () => {
    try {
      const response = await apiFetch("/api/downloads");
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as DownloadItem[];
      setItems(data);
      setSelectedItem((prev) => {
        if (!prev) {
          return prev;
        }
        const key = prev.user + (prev.virtual_path || prev.path);
        return data.find((item) => item.user + (item.virtual_path || item.path) === key) || null;
      });
    } catch {
      setItems([]);
    }
  }, []);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!active) {
        return;
      }
      await refreshDownloads();
    };

    load();
    const timer = window.setInterval(load, 2000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [refreshDownloads]);

  const groupedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      switch (sortKey) {
        case "user":
          return a.user.localeCompare(b.user) * direction;
        case "path":
          return a.path.localeCompare(b.path) * direction;
        case "size":
          return (a.size - b.size) * direction;
        case "progress":
          return (getProgress(a) - getProgress(b)) * direction;
        case "status":
          return a.status.localeCompare(b.status) * direction;
        case "queued_at":
          return ((a.queued_at || 0) - (b.queued_at || 0)) * direction;
        default:
          return 0;
      }
    });

    const groups: Array<{ key: string; user: string; folder: string; items: DownloadItem[]; isFolder?: boolean }> = [];
    for (const item of sorted) {
      const key = `${item.user}__${item.folder}`;
      if (item.isFolder) {
        const existing = groups.find((group) => group.key === key);
        if (existing) {
          existing.items.push(item);
        } else {
          groups.push({ key, user: item.user, folder: item.folder, items: [item], isFolder: true });
        }
      } else {
        groups.push({ key: `${key}-${item.path}`, user: item.user, folder: item.folder, items: [item] });
      }
    }
    return groups;
  }, [items, sortDirection, sortKey]);

  const hasCompleted = useMemo(() => items.some((item) => isFinished(item.status)), [items]);

  const requestSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const sortArrow = sortDirection === "asc" ? "▲" : "▼";

  const userLink = (user: string) => (
    <button
      type="button"
      className="link-button"
      data-tooltip={`Browse ${user}'s files`}
      onMouseEnter={() => prewarmUser(user)}
      onMouseLeave={cancelPrewarm}
      onClick={(event) => {
        event.stopPropagation();
        navigate(`/user/${encodeURIComponent(user)}`);
      }}
    >
      {user}
    </button>
  );

  const requestAction = async (action: "pause" | "resume" | "cancel" | "clear", item: DownloadItem) => {
    const virtualPath = item.virtual_path || item.path;
    if (!item.user || !virtualPath) {
      return;
    }
    const params = new URLSearchParams();
    params.set("user", item.user);
    params.set("path", virtualPath);
    try {
      await apiFetch(`/api/downloads/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
      });
      await refreshDownloads();
    } catch {
      // Ignore action failures for now.
    }
  };

  const requestFileRename = async (item: DownloadItem, newName: string) => {
    if (!item.local_path) {
      addToast("File not found.");
      return null;
    }
    const params = new URLSearchParams();
    params.set("path", item.local_path);
    params.set("name", newName);
    params.set("download_user", item.user);
    params.set("download_path", item.virtual_path || item.path);
    try {
      const response = await apiFetch("/api/files/rename", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
      });
      if (!response.ok) {
        addToast("Rename failed.");
        return null;
      }
    } catch {
      addToast("Rename failed.");
      return null;
    }
    const updatedPath = item.local_path.replace(/[^/\\]+$/, newName);
    return updatedPath;
  };

  const requestFileDelete = async (item: DownloadItem) => {
    if (!item.local_path) {
      addToast("File not found.");
      return false;
    }
    const params = new URLSearchParams();
    params.set("path", item.local_path);
    params.set("download_user", item.user);
    params.set("download_path", item.virtual_path || item.path);
    try {
      const response = await apiFetch("/api/files/delete", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
      });
      if (!response.ok) {
        addToast("Delete failed.");
      }
      return response.ok;
    } catch {
      addToast("Delete failed.");
      return false;
    }
  };

  const verifyMediaAccess = async (path: string, failureMessage: string) => {
    try {
      const response = await apiFetch(`/api/media/meta?path=${encodeURIComponent(path)}`);
      if (!response.ok) {
        addToast(failureMessage);
        return false;
      }
      return true;
    } catch {
      addToast(failureMessage);
      return false;
    }
  };

  const handleClearCompleted = async () => {
    if (!hasCompleted) {
      return;
    }
    try {
      await apiFetch("/api/downloads/clear-completed", { method: "POST" });
    } catch {
      // Ignore failures for now.
    }
  };

  const handleRename = async () => {
    if (!selectedItem || !renameValue.trim()) {
      return;
    }
    const newPath = await requestFileRename(selectedItem, renameValue.trim());
    if (!newPath) {
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        const itemKey = item.user + (item.virtual_path || item.path);
        const selectedKey = selectedItem.user + (selectedItem.virtual_path || selectedItem.path);
        if (itemKey === selectedKey) {
          return { ...item, local_path: newPath };
        }
        return item;
      })
    );
    setSelectedItem((prev) => (prev ? { ...prev, local_path: newPath } : prev));
    setShowRename(false);
  };

  const handleDelete = async () => {
    if (!selectedItem) {
      return;
    }
    const ok = await requestFileDelete(selectedItem);
    if (!ok) {
      return;
    }
    setItems((prev) =>
      prev.map((item) => {
        const itemKey = item.user + (item.virtual_path || item.path);
        const selectedKey = selectedItem.user + (selectedItem.virtual_path || selectedItem.path);
        if (itemKey === selectedKey) {
          return { ...item, local_path: null };
        }
        return item;
      })
    );
    setSelectedItem(null);
    setShowDelete(false);
  };

  const handlePlay = async (item: DownloadItem) => {
    if (!item.local_path) {
      addToast("File not found.");
      return;
    }
    const ok = await verifyMediaAccess(item.local_path, "Playback failed.");
    if (!ok) {
      return;
    }
    playTrack(toTrack(item));
  };

  const handleQueue = async (item: DownloadItem) => {
    if (!item.local_path) {
      addToast("File not found.");
      return;
    }
    const ok = await verifyMediaAccess(item.local_path, "Add to queue failed.");
    if (!ok) {
      return;
    }
    enqueue(toTrack(item));
  };

  const runFileAction = async (endpoint: string, path: string, failureMessage: string) => {
    const params = new URLSearchParams();
    params.set("path", path);
    try {
      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString()
      });
      if (!response.ok) {
        addToast(failureMessage);
      }
    } catch {
      addToast(failureMessage);
    }
  };

  const handleReveal = (item: DownloadItem) => {
    if (item.local_path) {
      runFileAction("/api/files/reveal", item.local_path, "Could not reveal file.");
    }
  };

  const handleOpen = (item: DownloadItem) => {
    if (item.local_path) {
      runFileAction("/api/files/open", item.local_path, "Could not open file.");
    }
  };

  const toTrack = (item: DownloadItem): Track => ({
    id: item.local_path || item.path,
    title: (item.local_path || item.path).split(/[/\\]/).pop() || item.path,
    path: item.local_path || undefined,
    src: item.local_path ? `/api/media?path=${encodeURIComponent(item.local_path)}` : undefined
  });

  const downloadKey = (item: DownloadItem) => `${item.user}|${item.virtual_path || item.path}`;
  const selectedKey = selectedItem ? downloadKey(selectedItem) : null;
  const closingKey = closingItem ? downloadKey(closingItem) : null;

  const animateClose = (item: DownloadItem) => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    setClosingItem(item);
    closeTimerRef.current = window.setTimeout(() => {
      setClosingItem(null);
      closeTimerRef.current = null;
    }, 220);
  };

  const closeDetail = () => {
    if (selectedItem) {
      animateClose(selectedItem);
      setSelectedItem(null);
    }
  };

  useEffect(() => {
    if (!restoreSelectedRef.current || !items.length) {
      return;
    }
    const key = restoreSelectedRef.current;
    restoreSelectedRef.current = "";
    const match = items.find((item) => downloadKey(item) === key);
    if (match) {
      setSelectedItem((prev) => prev ?? match);
    }
  }, [items]);

  useEffect(() => {
    try {
      if (selectedItem) {
        window.sessionStorage.setItem("downloadsSelectedKey", downloadKey(selectedItem));
      } else if (!restoreSelectedRef.current) {
        window.sessionStorage.removeItem("downloadsSelectedKey");
      }
    } catch {
      // Ignore storage failures.
    }
  }, [selectedItem]);

  const renderFileActions = (item: DownloadItem) => {
    const fullPath = item.local_path || item.path;
    const pathParts = fullPath.split(/[/\\]/);
    const fileName = pathParts[pathParts.length - 1] || item.path;
    const finished = isFinished(item.status);
    const hasLocalPath = Boolean(item.local_path);
    const missingFileNotice = finished && !hasLocalPath ? "File not found on disk" : "";
    return (
      <FileActionBar
        fileName={fileName}
        remotePath={item.virtual_path || item.path}
        remoteUser={item.user}
        localPath={item.local_path ? String(item.local_path) : undefined}
        downloadsDir={downloadsDir}
        mediaPath={finished && item.local_path ? String(item.local_path) : undefined}
        notice={missingFileNotice}
        onPlay={() => handlePlay(item)}
        onQueue={() => handleQueue(item)}
        onReveal={() => handleReveal(item)}
        onOpen={() => handleOpen(item)}
        onRename={() => {
          setSelectedItem(item);
          setRenameValue((item.local_path || item.path).split(/[/\\]/).pop() || "");
          setShowRename(true);
        }}
        onDelete={() => {
          setSelectedItem(item);
          setShowDelete(true);
        }}
        onMove={() => addToast("Move is not implemented yet.")}
        disablePlay={!finished || !hasLocalPath}
        disableQueue={!finished || !hasLocalPath}
        disableActions={!finished || !hasLocalPath}
        showMove
        showRename
        showDelete
        showReveal={localFiles}
        showOpen={localFiles}
      />
    );
  };

  return (
    <div className="page">
      <header className="page-header">
        <div className="page-title-row">
          <span className="page-icon">
            <Download size={20} strokeWidth={1.7} />
          </span>
          <div>
            <h1>Downloads</h1>
            <p className="page-subtitle">Manage in-progress and completed downloads.</p>
          </div>
        </div>
      </header>

      <div className="section-header">
        <div />
        <button
          type="button"
          className="icon-button secondary-button"
          onClick={handleClearCompleted}
          disabled={!hasCompleted}
          aria-label="Clear completed"
          data-tooltip="Clear completed"
        >
          <BroomIcon size={16} strokeWidth={1.6} />
        </button>
      </div>

      <div className="table-card" onClick={closeDetail} role="presentation">
        <table>
          <thead>
            <tr>
              <th>
                <div className="table-sort">
                  <button type="button" className="sortable" onClick={() => requestSort("user")}>
                    User
                  </button>
                  <button
                    type="button"
                    className={`sort-arrow${sortKey === "user" ? "" : " sort-arrow-hidden"}`}
                    onClick={() => requestSort("user")}
                    aria-hidden={sortKey !== "user"}
                    tabIndex={sortKey === "user" ? 0 : -1}
                  >
                    {sortArrow}
                  </button>
                </div>
              </th>
              <th>
                <div className="table-sort">
                  <button type="button" className="sortable" onClick={() => requestSort("path")}>
                    File
                  </button>
                  <button
                    type="button"
                    className={`sort-arrow${sortKey === "path" ? "" : " sort-arrow-hidden"}`}
                    onClick={() => requestSort("path")}
                    aria-hidden={sortKey !== "path"}
                    tabIndex={sortKey === "path" ? 0 : -1}
                  >
                    {sortArrow}
                  </button>
                </div>
              </th>
              <th>
                <div className="table-sort">
                  <button type="button" className="sortable" onClick={() => requestSort("size")}>
                    Size
                  </button>
                  <button
                    type="button"
                    className={`sort-arrow${sortKey === "size" ? "" : " sort-arrow-hidden"}`}
                    onClick={() => requestSort("size")}
                    aria-hidden={sortKey !== "size"}
                    tabIndex={sortKey === "size" ? 0 : -1}
                  >
                    {sortArrow}
                  </button>
                </div>
              </th>
              <th>
                <div className="table-sort">
                  <button type="button" className="sortable" onClick={() => requestSort("progress")}>
                    Progress
                  </button>
                  <button
                    type="button"
                    className={`sort-arrow${sortKey === "progress" ? "" : " sort-arrow-hidden"}`}
                    onClick={() => requestSort("progress")}
                    aria-hidden={sortKey !== "progress"}
                    tabIndex={sortKey === "progress" ? 0 : -1}
                  >
                    {sortArrow}
                  </button>
                </div>
              </th>
              <th className="downloads-status-col">
                <div className="table-sort">
                  <button type="button" className="sortable" onClick={() => requestSort("status")}>
                    Status
                  </button>
                  <button
                    type="button"
                    className={`sort-arrow${sortKey === "status" ? "" : " sort-arrow-hidden"}`}
                    onClick={() => requestSort("status")}
                    aria-hidden={sortKey !== "status"}
                    tabIndex={sortKey === "status" ? 0 : -1}
                  >
                    {sortArrow}
                  </button>
                </div>
              </th>
              <th className="downloads-added-col">
                <div className="table-sort">
                  <button type="button" className="sortable" onClick={() => requestSort("queued_at")}>
                    Added
                  </button>
                  <button
                    type="button"
                    className={`sort-arrow${sortKey === "queued_at" ? "" : " sort-arrow-hidden"}`}
                    onClick={() => requestSort("queued_at")}
                    aria-hidden={sortKey !== "queued_at"}
                    tabIndex={sortKey === "queued_at" ? 0 : -1}
                  >
                    {sortArrow}
                  </button>
                </div>
              </th>
              <th className="table-actions-header">
                <div className="table-actions-spacer" />
              </th>
            </tr>
          </thead>
          <tbody>
            {groupedItems.flatMap((group) => {
              const groupHeader = group.isFolder ? (
                <tr key={`${group.key}-group`} className="results-group downloads-group">
                  <td className="downloads-user">{userLink(group.user)}</td>
                  <td className="downloads-path">{group.folder}</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              ) : null;

                const rows = group.items.flatMap((item, index) => [
                <tr
                  key={`${group.key}-${item.path}`}
                  className={`results-file downloads-file${index === group.items.length - 1 ? " results-file-last" : ""}${
                    isFinished(item.status) && item.local_path ? " row-clickable" : ""
                  }${selectedKey === downloadKey(item) ? " downloads-row-selected" : ""}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (selectedKey === downloadKey(item)) {
                      closeDetail();
                    } else {
                      if (selectedItem) {
                        animateClose(selectedItem);
                      }
                      setSelectedItem(item);
                    }
                  }}
                >
                  <td className="downloads-user">{group.isFolder ? "" : userLink(item.user)}</td>
                  <td className="downloads-path">{shortRemotePath(item.path)}</td>
                  <td>{formatSize(item.size)}</td>
                  <td>
                    <div className="progress-cell">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${getProgress(item)}%` }}></div>
                      </div>
                      <span>{getProgress(item)}%</span>
                    </div>
                  </td>
                    <td className="downloads-status-col">
                      <span className="downloads-status">{formatStatus(item.status)}</span>
                      {formatSpeed(item) ? (
                        <span className="downloads-speed">{formatSpeed(item)}</span>
                      ) : null}
                    </td>
                    <td className="downloads-added" data-tooltip={getQueuedAtTimestamp(item.queued_at)}>
                      {getQueuedAtDate(item.queued_at)}
                    </td>
                    <td>
                      <div className="row-actions">
                        {!isFinished(item.status) && !isPaused(item.status) && (
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Pause"
                            data-tooltip="Pause download"
                            onClick={(event) => {
                              event.stopPropagation();
                              requestAction("pause", item);
                            }}
                          >
                            <Pause size={18} strokeWidth={1.6} />
                          </button>
                        )}
                        {isPaused(item.status) && (
                          <button
                            type="button"
                            className="icon-button"
                            aria-label="Resume"
                            data-tooltip="Resume download"
                            onClick={(event) => {
                              event.stopPropagation();
                              requestAction("resume", item);
                            }}
                          >
                            <Play size={18} strokeWidth={1.6} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="icon-button secondary-button"
                          aria-label={isFinished(item.status) ? "Remove download" : "Cancel download"}
                          data-tooltip={isFinished(item.status) ? "Remove download" : "Cancel download"}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isFinished(item.status)) {
                              requestAction("clear", item);
                            } else {
                              setConfirmCancelItem(item);
                            }
                          }}
                        >
                          <X size={14} strokeWidth={1.6} />
                        </button>
                      </div>
                    </td>
                  </tr>,
                  ...(selectedKey === downloadKey(item) || closingKey === downloadKey(item)
                    ? [
                        <tr key={`${group.key}-${item.path}-detail`} className="downloads-detail-row">
                          <td colSpan={7} onClick={(event) => event.stopPropagation()}>
                            <SlideReveal closing={selectedKey !== downloadKey(item)}>
                              {renderFileActions(item)}
                            </SlideReveal>
                          </td>
                        </tr>
                      ]
                    : [])
                ]);

              return groupHeader ? [groupHeader, ...rows] : rows;
            })}
            {groupedItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-cell">
                  No downloads yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal
        open={showRename && Boolean(selectedItem)}
        title="Rename file"
        onClose={() => setShowRename(false)}
        footer={
          <>
            <button type="button" onClick={handleRename}>
              Save
            </button>
            <button type="button" className="ghost-button" onClick={() => setShowRename(false)}>
              Cancel
            </button>
          </>
        }
      >
        <input
          type="text"
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
        />
      </Modal>

      <Modal
        open={showDelete && Boolean(selectedItem)}
        title="Delete file"
        onClose={() => setShowDelete(false)}
        className="modal-delete"
        footer={
          <>
            <button type="button" className="danger-button" onClick={handleDelete}>
              Delete
            </button>
            <button type="button" className="ghost-button" onClick={() => setShowDelete(false)}>
              Cancel
            </button>
          </>
        }
      >
        <div className="download-delete-path">{deletePath}</div>
        <p>Delete this file from disk?</p>
      </Modal>

      <Modal
        open={Boolean(confirmCancelItem)}
        title="Cancel download"
        onClose={() => setConfirmCancelItem(null)}
        className="modal-delete"
        footer={
          <>
            <button
              type="button"
              className="danger-button"
              onClick={() => {
                if (confirmCancelItem) {
                  requestAction("cancel", confirmCancelItem);
                }
                setConfirmCancelItem(null);
              }}
            >
              Cancel download
            </button>
            <button type="button" className="ghost-button" onClick={() => setConfirmCancelItem(null)}>
              Keep
            </button>
          </>
        }
      >
        <div className="download-delete-path">{confirmCancelItem?.path}</div>
        <p>Cancel this download?</p>
      </Modal>
    </div>
  );
}
