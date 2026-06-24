import { useState, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AlertTriangle, FileText, CloudUpload, Upload, Loader2 } from 'lucide-react';
import { AppDispatch, RootState } from '@/store';
import { uploadPdf } from '@/store/learningsSlice';
import Button from '@/components/ui/Button';

interface Props {
  learningId: string;
}

export default function PdfUploadZone({ learningId }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { uploading, uploadProgress, error } = useSelector((s: RootState) => s.learnings);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState('');

  const validateAndSet = (file: File): boolean => {
    setLocalError('');
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      setLocalError('Only PDF files are accepted.');
      return false;
    }
    if (file.size > 50 * 1024 * 1024) {
      setLocalError('File too large — maximum 50 MB.');
      return false;
    }
    setSelectedFile(file);
    return true;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSet(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSet(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    const result = await dispatch(uploadPdf({ id: learningId, file: selectedFile }));
    if (uploadPdf.fulfilled.match(result)) {
      setSelectedFile(null);
    }
  };

  const displayError = localError || error;

  return (
    <div>
      {displayError && (
        <div className="msg msg-error" style={{ marginBottom: '1rem' }}>
          <span><AlertTriangle size={16} /></span> {displayError}
        </div>
      )}

      <div
        id="pdf-upload-zone"
        className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        aria-label="Upload PDF"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileChange}
          aria-hidden="true"
        />

        <div className="upload-zone-icon">
          {uploading ? <Loader2 size={48} className="animate-spin" /> : selectedFile ? <FileText size={48} /> : <CloudUpload size={48} />}
        </div>

        {uploading ? (
          <>
            <h3>Uploading…</h3>
            <p>{uploadProgress}% complete</p>
            <div className="upload-progress-bar">
              <div
                className="upload-progress-fill"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </>
        ) : selectedFile ? (
          <>
            <h3>PDF selected</h3>
            <p className="upload-filename">{selectedFile.name}</p>
            <p className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          </>
        ) : (
          <>
            <h3>Drop your PDF here</h3>
            <p>or click to browse — max 50 MB</p>
          </>
        )}
      </div>

      {selectedFile && !uploading && (
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <Button
            id="upload-pdf-btn"
            onClick={handleUpload}
            style={{ flex: 1 }}
          >
            <Upload size={16} style={{ display: 'inline', marginRight: '8px' }} /> Upload PDF
          </Button>
          <Button
            variant="ghost"
            onClick={() => { setSelectedFile(null); setLocalError(''); }}
          >
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}
