import './RequestsList.css';

export function RequestsList({ requests, onApprove, onReject }) {

  const handleApprove = async (requestId) => {
    if (onApprove) {
      await onApprove(requestId);
    }
  };

  const handleReject = async (requestId) => {
    if (onReject) {
      await onReject(requestId);
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const otherRequests = requests.filter(r => r.status !== 'pending');

  return (
    <div className="requests-panel">
      {pendingRequests.length > 0 && (
        <div className="requests-section">
          <h3>Pending Approval ({pendingRequests.length})</h3>
          <div className="requests-list">
            {pendingRequests.map(request => (
              <div key={request.id} className="request-item pending">
                <div className="request-info">
                  <div className="request-song">
                    <strong>{request.song.title}</strong>
                    {request.song.artist && <span> - {request.song.artist}</span>}
                  </div>
                  <div className="request-meta">
                    <span className="requester">From: {request.requesterName}</span>
                    {request.message && <span className="message">"{request.message}"</span>}
                  </div>
                </div>
                <div className="request-actions">
                  <button
                    className="btn btn-sm btn-success"
                    onClick={() => handleApprove(request.id)}
                  >
                    ✓ Approve
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleReject(request.id)}
                  >
                    ✗ Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {otherRequests.length > 0 && (
        <div className="requests-section">
          <h3>Recent Requests</h3>
          <div className="requests-list">
            {otherRequests.slice(0, 10).map(request => (
              <div key={request.id} className={`request-item ${request.status}`}>
                <div className="request-info">
                  <div className="request-song">
                    <strong>{request.song.title}</strong>
                    {request.song.artist && <span> - {request.song.artist}</span>}
                  </div>
                  <div className="request-meta">
                    <span className="requester">From: {request.requesterName}</span>
                    <span className={`status-badge ${request.status}`}>
                      {request.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {requests.length === 0 && (
        <div className="requests-empty">
          <p>No song requests yet</p>
        </div>
      )}
    </div>
  );
}