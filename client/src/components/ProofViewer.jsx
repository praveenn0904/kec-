import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Modal, Spinner } from './ui.jsx';

/** Shows an on-duty proof (image or PDF) inside the page. The file is fetched with the user's login. */
export default function ProofViewer({ request, onClose }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let url = null;
    let cancelled = false;
    api
      .proof(request.id)
      .then(({ blob, type }) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setFile({ url, type });
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [request.id]);

  const isPdf = file?.type.includes('pdf');

  return (
    <Modal title={`Proof: ${request.proofName || 'attachment'}`} onClose={onClose} wide>
      {error && <p className="form-error">{error}</p>}
      {!file && !error && <Spinner label="Loading proof…" />}
      {file && (isPdf ? (
        <iframe className="proof-frame" title="Proof document" src={file.url} />
      ) : (
        <img className="proof-img" src={file.url} alt="Proof submitted by the student" />
      ))}
      {file && (
        <div className="form-actions">
          <a className="btn" href={file.url} download={request.proofName || 'proof'}>Download</a>
        </div>
      )}
    </Modal>
  );
}
