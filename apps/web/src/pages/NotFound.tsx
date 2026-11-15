import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { Empty, Logo } from "../components/ui";

export function NotFound() {
  return (
    <div className="container col center" style={{ minHeight: "100vh", alignItems: "center" }}>
      <Logo />
      <Empty icon={<Compass size={22} />} title="This page doesn't exist">
        <Link to="/">Go to the home page</Link>
      </Empty>
    </div>
  );
}
