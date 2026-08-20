import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 text-foreground">
      <Card className="w-full max-w-lg border-border bg-card/90 text-card-foreground shadow-lg backdrop-blur-sm">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="mb-6 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse rounded-full bg-destructive/15" />
              <AlertCircle className="relative h-16 w-16 text-destructive" />
            </div>
          </div>
          <h1 className="mb-2 text-4xl font-bold text-foreground">404</h1>
          <h2 className="mb-4 text-xl font-semibold text-foreground">找不到頁面</h2>
          <p className="mb-8 leading-relaxed text-muted-foreground">
            您要前往的頁面不存在或已移動。
            <br />
            請返回共帳首頁繼續操作。
          </p>
          <div id="not-found-button-group" className="flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={() => setLocation("/")} className="rounded-lg bg-primary px-6 py-2.5 text-primary-foreground shadow-md transition-all duration-200 hover:bg-primary/90 hover:shadow-lg">
              <Home className="mr-2 h-4 w-4" />
              返回首頁
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
