import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Editor } from "./editor/Editor";
import { Library } from "./Library";

function useHashRoute(): string {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash;
}

export function App() {
  const hash = useHashRoute();
  const tree = useQuery({ queryKey: ["tree"], queryFn: api.tree });
  const m = /^#\/edit\/(.+)$/.exec(hash);
  if (m) return <Editor file={decodeURIComponent(m[1]!)} tree={tree.data} />;
  return <Library tree={tree.data} error={tree.error as Error | null} />;
}
