import { useEffect, useState } from "react";
import socket from "../socket";
import "./ChatPanel.css";

function ChatPanel() {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [myId, setMyId] = useState("");

  useEffect(() => {
    // set socket id safely
    setMyId(socket.id);

    const onReceive = (msg) => {
      setMessages((prev) => [...prev, msg]);
    };

    socket.on("RECEIVE_MESSAGE", onReceive);

    return () => {
      socket.off("RECEIVE_MESSAGE", onReceive);
    };
  }, []);

  const send = () => {
    if (!text.trim()) return;
    socket.emit("SEND_MESSAGE", text);
    setText("");
  };

  return (
    <div className="chat-panel">
      <div className="chat-header">Chat</div>

      <div className="chat-body">
        {messages.length === 0 && (
          <div style={{ fontSize: "13px", color: "#999" }}>
            No messages yet
          </div>
        )}

        {messages.map((m, i) => {
          const isMe = m.socketId === myId;

          return (
            <div
              key={i}
              className={`chat-row ${isMe ? "me" : "other"}`}
            >
              <div className="chat-user">{m.user}</div>
              <div className="chat-bubble">{m.message}</div>
            </div>
          );
        })}
      </div>

      <div className="chat-input">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type..."
          onKeyDown={(e) => e.key === "Enter" && send()}
        />
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}

export default ChatPanel;
