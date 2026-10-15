import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, verifying } = useAuth();
  const location = useLocation();

  if (verifying)
    return (
      <div role="status" style={{ padding: 32 }}>
        Living Water Guatemala?
      </div>
    );
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
