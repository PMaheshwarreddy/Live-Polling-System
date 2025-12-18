import { useEffect, useState } from "react";
import "./Timer.css";

function Timer({ duration }) {
  const [time, setTime] = useState(duration);

  useEffect(() => {
    if (time === 0) return;
    const t = setTimeout(() => setTime(time - 1), 1000);
    return () => clearTimeout(t);
  }, [time]);

  return (
    <div className="timer">
      ⏱ {`00:${time < 10 ? "0" + time : time}`}
    </div>
  );
}

export default Timer;
