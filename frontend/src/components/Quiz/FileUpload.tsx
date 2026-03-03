import { useRef, useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';

interface FileUploadProps {
  label: string;
  accept: string;
  value: string | null;
  onChange: (url: string | null) => void;
}

export default function FileUpload({ label, accept, value, onChange }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/api/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(data.url);
      toast.success('Fichier uploadé');
    } catch {
      toast.error("Erreur lors de l'upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const isImage = accept.includes('image');

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {value ? (
        <div className="flex items-center gap-3">
          {isImage ? (
            <img
              src={value}
              alt=""
              className="w-20 h-20 object-cover rounded-lg border cursor-pointer hover:opacity-80 transition"
              onClick={() => setPreview(true)}
            />
          ) : (
            <audio src={value} controls className="h-10" />
          )}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="p-1.5 text-gray-400 hover:text-red-500 transition"
            title="Supprimer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-primary-400 hover:text-primary-500 transition disabled:opacity-50"
        >
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Upload...' : 'Choisir un fichier'}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleUpload}
        className="hidden"
      />
      {preview && value && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 cursor-pointer"
          onClick={() => setPreview(false)}
        >
          <img
            src={value}
            alt=""
            className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
