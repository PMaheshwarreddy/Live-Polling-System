import { useEffect, useState } from "react";
import socket from "../socket";
import "./ParticipantsPanel.css";

function ParticipantsPanel() {
  const [participants, setParticipants] = useState([]);

  useEffect(() => {
    // Fetch participants if socket already connected
    if (socket.connected) {
      socket.emit("GET_PARTICIPANTS");
    }

    // Fetch again once socket connects
    const onConnect = () => {
      socket.emit("GET_PARTICIPANTS");
    };

    const handleUpdate = (list) => {
      setParticipants(list);
    };

    socket.on("connect", onConnect);
    socket.on("PARTICIPANTS_UPDATE", handleUpdate);

    return () => {
      socket.off("connect", onConnect);
      socket.off("PARTICIPANTS_UPDATE", handleUpdate);
    };
  }, []);

  return (
    <div className="participants-panel">
      <div className="participants-header">Participants</div>

      <div className="participants-body">
        {participants.length === 0 ? (
          <div className="empty-text">No participants</div>
        ) : (
          participants.map((p) => (
            <div key={p.socketId} className="participant-row">
              <span>{p.name}</span>
              <button
                className="kick-btn"
                onClick={() => socket.emit("KICK_STUDENT", p.socketId)}
              >
                Kick out
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default ParticipantsPanel;
