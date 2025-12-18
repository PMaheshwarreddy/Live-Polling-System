import { useState } from "react";
import "./RoleSelect.css";

function RoleSelect({ onContinue }) {
  const [role, setRole] = useState(null);

  return (
    <div className="role-wrapper">
      <div className="role-badge">✨ Intervue Poll</div>

      <h1 className="role-title">
        Welcome to the <span>Live Polling System</span>
      </h1>

      <p className="role-subtitle">
        Please select the role that best describes you to begin using the live
        polling system
      </p>

      <div className="role-cards">
        <div
          className={`role-card ${role === "student" ? "active" : ""}`}
          onClick={() => setRole("student")}
        >
          <h3>I’m a Student</h3>
          <p>
            Lorem Ipsum is simply dummy text of the printing and typesetting
            industry
          </p>
        </div>

        <div
          className={`role-card ${role === "teacher" ? "active" : ""}`}
          onClick={() => setRole("teacher")}
        >
          <h3>I’m a Teacher</h3>
          <p>Submit answers and view live poll results in real-time.</p>
        </div>
      </div>

      <button
  className="continue-btn"
  disabled={!role}
  onClick={() => onContinue(role)}
>
  Continue
</button>

    </div>
  );
}

export default RoleSelect;
