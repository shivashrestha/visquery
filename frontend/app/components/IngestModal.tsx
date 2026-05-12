'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Upload, CheckCircle2, XCircle, Loader2, HardDrive, Globe } from 'lucide-react';
import { uploadImage } from '@/lib/api';
import { savePersonalImage, type PersonalImage } from '@/lib/personalImages';

type ItemStatus = 'pending' | 'uploading' | 'done' | 'error';

type UploadItem = {
  id: string;
  file: File;
  preview: string;
  status: ItemStatus;
  imageId?: string;
};

interface IngestModalProps {
  onClose: () => void;
}

const MAX_IMAGES = 5;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function IngestModal({ onClose }: IngestModalProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [storeLocally, setStoreLocally] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const newFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    setItems((prev) => {
      const remaining = MAX_IMAGES - prev.length;
      if (remaining <= 0) return prev;
      const toAdd = newFiles.slice(0, remaining).map((file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random()}`,
        file,
        preview: URL.createObjectURL(file),
        status: 'pending' as ItemStatus,
      }));
      return [...prev, ...toAdd];
    });
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files);
      e.target.value = '';
    },
    [addFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const uploadAll = useCallback(async () => {
    const pending = items.filter((i) => i.status === 'pending');
    if (!pending.length) return;
    setUploading(true);
    for (const item of pending) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, status: 'uploading' } : i)),
      );
      try {
        let imageId: string | undefined;
        if (storeLocally) {
          const dataUrl = await readFileAsDataUrl(item.file);
          const personalImg: PersonalImage = {
            id: `local-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            name: item.file.name,
            dataUrl,
            addedAt: Date.now(),
          };
          savePersonalImage(personalImg);
          imageId = personalImg.id;
        } else {
          const result = await uploadImage(item.file);
          imageId = result.image_id;
        }
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'done', imageId } : i)),
        );
      } catch {
        setItems((prev) =>
          prev.map((i) => (i.id === item.id ? { ...i, status: 'error' } : i)),
        );
      }
    }
    setUploading(false);
  }, [items, storeLocally]);

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const doneCount = items.filter((i) => i.status === 'done').length;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const uploadingItem = items.find((i) => i.status === 'uploading');
  const atLimit = items.length >= MAX_IMAGES;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-near-black/40 backdrop-blur-sm"
        onClick={!uploading ? onClose : undefined}
      />

      <div className="relative bg-near-white border border-border rounded-sm shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div>
            <h2 className="font-serif text-lg text-near-black">Ingest Images</h2>
            <p className="text-xs text-muted mt-0.5">
              Upload up to {MAX_IMAGES} architectural images
            </p>
          </div>
          <button
            onClick={!uploading ? onClose : undefined}
            disabled={uploading}
            className="p-1.5 text-muted hover:text-near-black transition-colors rounded disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Storage toggle */}
        <div className="mx-6 mt-4 flex-shrink-0">
          <p className="text-xs text-muted uppercase tracking-wider font-medium mb-2">
            Storage
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setStoreLocally(true)}
              className={[
                'flex items-center gap-2 px-3 py-2 rounded-sm text-xs border transition-colors flex-1',
                storeLocally
                  ? 'border-accent bg-amber-50/60 text-near-black'
                  : 'border-border text-muted hover:border-accent/40',
              ].join(' ')}
            >
              <HardDrive className="w-3.5 h-3.5 flex-shrink-0" />
              <div className="text-left">
                <div className="font-medium">Browser only</div>
                <div className="text-muted mt-0.5 leading-tight">
                  Stays in your browser. Not sent to any server.
                </div>
              </div>
            </button>
            <button
              onClick={() => setStoreLocally(false)}
              className={[
                'flex items-center gap-2 px-3 py-2 rounded-sm text-xs border transition-colors flex-1',
                !storeLocally
                  ? 'border-accent bg-amber-50/60 text-near-black'
                  : 'border-border text-muted hover:border-accent/40',
              ].join(' ')}
            >
              <Globe className="w-3.5 h-3.5 flex-shrink-0" />
              <div className="text-left">
                <div className="font-medium">App storage</div>
                <div className="text-muted mt-0.5 leading-tight">
                  Indexed and searchable. Visible to all users.
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* Drop zone */}
        <div
          className={[
            'mx-6 mt-4 border-2 border-dashed rounded-sm p-7 text-center transition-colors flex-shrink-0',
            atLimit
              ? 'border-border bg-surface/30 cursor-not-allowed opacity-60'
              : dragOver
                ? 'border-accent bg-amber-50/40 cursor-pointer'
                : 'border-border hover:border-accent/50 hover:bg-stone-50/60 cursor-pointer',
          ].join(' ')}
          onDragOver={(e) => {
            e.preventDefault();
            if (!atLimit) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !atLimit && fileRef.current?.click()}
        >
          <Upload
            className={`w-6 h-6 mx-auto mb-2.5 transition-colors ${dragOver ? 'text-accent' : 'text-muted'}`}
          />
          {atLimit ? (
            <p className="text-sm font-medium text-near-black">
              Maximum {MAX_IMAGES} images reached
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-near-black">
                Drop images here or click to browse
              </p>
              <p className="text-xs text-muted mt-1">
                PNG, JPG, WEBP — up to {MAX_IMAGES} images
                {items.length > 0 && ` (${MAX_IMAGES - items.length} remaining)`}
              </p>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="sr-only"
          aria-hidden="true"
        />

        {/* Image grid */}
        {items.length > 0 && (
          <div className="flex-1 overflow-y-auto px-6 pt-4 pb-2 min-h-0">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {items.map((item) => (
                <div key={item.id} className="relative group aspect-square">
                  <img
                    src={item.preview}
                    alt={item.file.name}
                    className="w-full h-full object-cover rounded-sm border border-border"
                  />

                  {item.status === 'uploading' && (
                    <div className="absolute inset-0 bg-white/75 rounded-sm flex items-center justify-center">
                      <Loader2 className="w-5 h-5 text-accent animate-spin" />
                    </div>
                  )}
                  {item.status === 'done' && (
                    <div className="absolute inset-0 bg-white/60 rounded-sm flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <div className="absolute inset-0 bg-white/75 rounded-sm flex items-center justify-center">
                      <XCircle className="w-5 h-5 text-red-500" />
                    </div>
                  )}

                  {item.status === 'pending' && (
                    <button
                      onClick={() => removeItem(item.id)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-near-black text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                      aria-label={`Remove ${item.file.name}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}

                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/55 to-transparent px-1.5 py-1 rounded-b-sm">
                    <p className="text-white text-[10px] truncate leading-tight">
                      {item.file.name}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between flex-shrink-0 mt-auto">
          <div className="text-xs text-muted">
            {items.length === 0 && 'No images selected'}
            {items.length > 0 && (
              <span className="flex items-center gap-2 flex-wrap">
                <span>
                  {items.length}/{MAX_IMAGES} image{items.length !== 1 ? 's' : ''}
                </span>
                {uploadingItem && (
                  <span className="text-accent flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {storeLocally ? 'saving…' : 'uploading…'}
                  </span>
                )}
                {doneCount > 0 && (
                  <span className="text-emerald-600">
                    {doneCount} done
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="text-red-500">{errorCount} failed</span>
                )}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={uploading}
              className="px-3 py-1.5 text-sm text-muted hover:text-near-black transition-colors disabled:opacity-40"
            >
              {pendingCount === 0 && doneCount > 0 ? 'Done' : 'Cancel'}
            </button>
            {pendingCount > 0 && (
              <button
                onClick={uploadAll}
                disabled={uploading}
                className={[
                  'px-4 py-1.5 text-sm rounded-sm font-medium transition-colors flex items-center gap-2',
                  uploading
                    ? 'bg-border text-muted cursor-not-allowed'
                    : 'bg-accent text-white hover:bg-accent-700',
                ].join(' ')}
              >
                {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {storeLocally ? 'Save' : 'Upload'} {pendingCount} image{pendingCount !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
