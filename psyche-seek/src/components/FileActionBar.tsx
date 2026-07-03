import { ExternalLink, FileText, FolderInput, FolderOpen, ListVideo, Music2, Pencil, Play, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PATH_SEPARATOR } from "../paths";
import { cancelPrewarm, prewarmUser } from "../prewarm";

const AUDIO_EXTENSIONS = /\.(mp3|flac|ogg|opus|wav|aac|m4a|wma|alac|aiff|ape)$/i;

interface AudioMetadata {
  artist?: string;
  title?: string;
  album?: string;
  year?: string;
  duration?: number;
  bitrate?: number;
  samplerate?: number;
  bitdepth?: number;
  isVbr?: boolean;
}

interface FileActionBarProps {
  fileName: string;
  filePath?: string;
  remotePath?: string;
  remoteUser?: string;
  localPath?: string;
  downloadsDir?: string;
  mediaPath?: string;
  notice?: string;
  statusText?: string;
  onClear?: () => void;
  showClear?: boolean;
  onPlay: () => void;
  onQueue: () => void;
  onRename: () => void;
  onDelete: () => void;
  onReveal?: () => void;
  onOpen?: () => void;
  onMove?: () => void;
  disablePlay?: boolean;
  disableQueue?: boolean;
  disableActions?: boolean;
  showRename?: boolean;
  showDelete?: boolean;
  showReveal?: boolean;
  showOpen?: boolean;
  showMove?: boolean;
}

export default function FileActionBar({
  fileName,
  filePath,
  remotePath,
  remoteUser,
  localPath,
  downloadsDir,
  mediaPath,
  notice,
  statusText,
  onClear,
  showClear = false,
  onPlay,
  onQueue,
  onRename,
  onDelete,
  onReveal,
  onOpen,
  onMove,
  disablePlay = false,
  disableQueue = false,
  disableActions = false,
  showRename = true,
  showDelete = true,
  showReveal = false,
  showOpen = false,
  showMove = false
}: FileActionBarProps) {
  const [metadata, setMetadata] = useState<AudioMetadata | null>(null);
  const metadataCache = useMemo(() => new Map<string, AudioMetadata | null>(), []);

  useEffect(() => {
    if (!mediaPath) {
      setMetadata(null);
      return;
    }
    if (metadataCache.has(mediaPath)) {
      setMetadata(metadataCache.get(mediaPath) ?? null);
      return;
    }
    let active = true;
    const loadMetadata = async () => {
      try {
        const url = `/api/media/audio-meta?path=${encodeURIComponent(mediaPath)}`;
        const response = await fetch(url);
        if (!response.ok) {
          metadataCache.set(mediaPath, null);
          return;
        }
        const payload = (await response.json()) as {
          metadata?: {
            artist?: string;
            title?: string;
            album?: string;
            year?: string;
            duration?: number;
            bitrate?: number;
            samplerate?: number;
            bitdepth?: number;
            is_vbr?: boolean;
          };
        };
        if (!active) {
          return;
        }
        const meta = payload?.metadata;
        const artist = meta?.artist || "";
        const title = meta?.title || "";
        const album = meta?.album || "";
        const year = meta?.year || "";
        const duration = typeof meta?.duration === "number" ? meta.duration : undefined;
        const bitrate = typeof meta?.bitrate === "number" ? meta.bitrate : undefined;
        const samplerate = typeof meta?.samplerate === "number" ? meta.samplerate : undefined;
        const bitdepth = typeof meta?.bitdepth === "number" ? meta.bitdepth : undefined;
        const isVbr = Boolean(meta?.is_vbr);
        const hasMetadata = Boolean(artist || title || album || year || duration || bitrate);
        const next = hasMetadata
          ? { artist, title, album, year, duration, bitrate, samplerate, bitdepth, isVbr }
          : null;
        metadataCache.set(mediaPath, next);
        setMetadata(next);
      } catch {
        if (active) {
          metadataCache.set(mediaPath, null);
          setMetadata(null);
        }
      }
    };
    loadMetadata();
    return () => {
      active = false;
    };
  }, [mediaPath, metadataCache]);

  const displayTitle = useMemo(() => {
    if (!metadata) {
      return { main: fileName, album: "" };
    }
    const parts = [metadata.artist, metadata.title].filter((value) => Boolean(value));
    return {
      main: parts.join(" - ") || fileName,
      album: metadata.album || ""
    };
  }, [fileName, metadata]);

  const techLine = useMemo(() => {
    if (!metadata) {
      return "";
    }
    const parts: string[] = [];
    if (metadata.year) {
      parts.push(String(metadata.year));
    }
    if (metadata.duration) {
      const total = Math.round(metadata.duration);
      parts.push(`${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} mins`);
    }
    if (metadata.bitrate) {
      parts.push(`${Math.round(metadata.bitrate)} kbps${metadata.isVbr ? " VBR" : ""}`);
    }
    if (metadata.samplerate) {
      parts.push(`${String(metadata.samplerate / 1000).replace(/\.0$/, "")} kHz`);
    }
    if (metadata.bitdepth) {
      parts.push(`${metadata.bitdepth}-bit`);
    }
    return parts.join(" \u00b7 ");
  }, [metadata]);

  const isAudio = AUDIO_EXTENSIONS.test(fileName);
  const navigate = useNavigate();

  const localCrumbs = (path: string, rootDir: string) => {
    const sep = path.includes("/") ? "/" : "\\";
    const root = rootDir.replace(/[\\/]+$/, "");
    if (!root || !path.startsWith(root + sep)) {
      return path;
    }
    const parts = path.slice(root.length + 1).split(/[\\/]/).filter(Boolean);
    const lastName = parts.pop() || "";
    let accum = root;
    const dirs = parts.map((part) => {
      accum = `${accum}${sep}${part}`;
      return { label: part, path: accum };
    });
    return (
      <>
        <button
          type="button"
          className="link-button"
          data-tooltip="Show in local files"
          onClick={() => navigate(`/files?path=${encodeURIComponent(root)}`)}
        >
          {root}
        </button>
        {dirs.map((dir) => (
          <span key={dir.path} className="crumb">
            <span className="crumb-sep">{PATH_SEPARATOR}</span>
            <button
              type="button"
              className="link-button"
              data-tooltip={`Show ${dir.label} in local files`}
              onClick={() => navigate(`/files?path=${encodeURIComponent(dir.path)}`)}
            >
              {dir.label}
            </button>
          </span>
        ))}
        <span className="crumb-sep">{PATH_SEPARATOR}</span>
        <button
          type="button"
          className="link-button"
          data-tooltip="Show in local files"
          onClick={() => navigate(`/files?path=${encodeURIComponent(path)}`)}
        >
          {lastName}
        </button>
      </>
    );
  };

  const remoteCrumbs = (path: string, user: string) => {
    const parts = path.split(/[\\/]/).filter(Boolean);
    const dirs = parts.slice(0, -1);
    const lastName = parts[parts.length - 1] || path;
    return (
      <>
        {dirs.map((part, index) => {
          const sub = dirs.slice(0, index + 1).join("\\");
          return (
            <span key={sub} className="crumb">
              {index > 0 ? <span className="crumb-sep">{PATH_SEPARATOR}</span> : null}
              <button
                type="button"
                className="link-button"
                data-tooltip={`Browse ${part}`}
                onClick={() =>
                  navigate(`/user/${encodeURIComponent(user)}?path=${encodeURIComponent(sub)}`)
                }
              >
                {part}
              </button>
            </span>
          );
        })}
        {dirs.length ? <span className="crumb-sep">{PATH_SEPARATOR}</span> : null}
        {lastName}
      </>
    );
  };

  return (
    <div className="file-actions">
      <div className="file-actions-top">
        <span className="file-actions-icon" aria-hidden="true">
          {isAudio ? <Music2 size={18} strokeWidth={1.6} /> : <FileText size={18} strokeWidth={1.6} />}
        </span>
        <div className="file-actions-info">
          <span className="file-actions-title">
            {displayTitle.main}
            {displayTitle.album ? (
              <span className="file-actions-album"> - {displayTitle.album}</span>
            ) : null}
          </span>
          {techLine ? <span className="file-actions-meta">{techLine}</span> : null}
        </div>
      </div>
      <div className="file-actions-paths">
          {remotePath || localPath ? (
            <>
              {remotePath ? (
                <span
                  className="file-actions-path"
                  onMouseEnter={remoteUser ? () => prewarmUser(remoteUser) : undefined}
                  onMouseLeave={remoteUser ? cancelPrewarm : undefined}
                >
                  <span className="file-actions-path-label">Remote</span>
                  {remoteUser ? remoteCrumbs(remotePath, remoteUser) : remotePath}
                </span>
              ) : null}
              {localPath ? (
                <span className="file-actions-path">
                  <span className="file-actions-path-label">Local</span>
                  {downloadsDir ? localCrumbs(localPath, downloadsDir) : localPath}
                </span>
              ) : notice ? (
                <span className="file-actions-notice">{notice}</span>
              ) : null}
            </>
          ) : notice ? (
            <span className="file-actions-notice">{notice}</span>
          ) : (
            <span className="file-actions-path">{filePath}</span>
          )}
      </div>
      <div className="file-actions-buttons">
        <div className="file-actions-left">
          {isAudio ? (
            <>
              <button
                type="button"
                className="outline-button icon-button"
                onClick={onPlay}
                aria-label="Play"
                data-tooltip="Play"
                disabled={disablePlay}
              >
                <Play size={16} strokeWidth={1.6} />
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={onQueue}
                aria-label="Add to queue"
                data-tooltip="Add to queue"
                disabled={disableQueue}
              >
                <ListVideo size={16} strokeWidth={1.6} />
              </button>
            </>
          ) : null}
        </div>
        <div className="file-actions-right">
          {statusText ? <span className="file-actions-status">{statusText}</span> : null}
          {showOpen && onOpen ? (
            <button
              type="button"
              className="icon-button ghost-button"
              onClick={onOpen}
              aria-label="Open in default app"
              data-tooltip="Open in default app"
              disabled={disableActions}
            >
              <ExternalLink size={16} strokeWidth={1.6} />
            </button>
          ) : null}
          {showReveal && onReveal ? (
            <button
              type="button"
              className="icon-button ghost-button"
              onClick={onReveal}
              aria-label="Reveal in file manager"
              data-tooltip="Reveal in file manager"
              disabled={disableActions}
            >
              <FolderOpen size={16} strokeWidth={1.6} />
            </button>
          ) : null}
          {showMove && onMove ? (
            <button
              type="button"
              className="icon-button"
              onClick={onMove}
              aria-label="Move"
              data-tooltip="Move"
              disabled={disableActions}
            >
              <FolderInput size={16} strokeWidth={1.6} />
            </button>
          ) : null}
          {showRename ? (
            <button
              type="button"
              className="icon-button"
              onClick={onRename}
              aria-label="Rename"
              data-tooltip="Rename"
              disabled={disableActions}
            >
              <Pencil size={16} strokeWidth={1.6} />
            </button>
          ) : null}
          {showDelete ? (
            <button
              type="button"
              className="icon-button danger-button"
              onClick={onDelete}
              aria-label="Delete"
              data-tooltip="Delete file"
              disabled={disableActions}
            >
              <Trash2 size={16} strokeWidth={1.6} />
            </button>
          ) : null}
          {showClear && onClear ? (
            <button
              type="button"
              className="icon-button ghost-button"
              onClick={onClear}
              aria-label="Remove download"
              data-tooltip="Remove download"
            >
              <X size={16} strokeWidth={1.6} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
