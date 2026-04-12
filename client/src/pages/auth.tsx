import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Languages } from "lucide-react";
import { LocaleToggle } from "@/components/locale-toggle";

export default function AuthPage() {
  const { login, register } = useAuth();
  const { t, dir } = useI18n();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form
  const [regUsername, setRegUsername] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(loginEmail, loginPassword);
      navigate("/");
    } catch (err: any) {
      const msg = err.message;
      let parsed = msg;
      try { parsed = JSON.parse(msg).message; } catch {}
      toast({ title: t("auth.loginFailed"), description: parsed, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await register(regUsername, regEmail, regPassword);
      navigate("/");
    } catch (err: any) {
      const msg = err.message;
      let parsed = msg;
      try { parsed = JSON.parse(msg).message; } catch {}
      toast({ title: t("auth.registerFailed"), description: parsed, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4" dir={dir}>
      <div className="absolute top-4 end-4">
        <LocaleToggle />
      </div>
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center justify-center gap-3 mb-8">
          <img src="/tendit-logo.jpg" alt="Tendit" className="w-16 h-16 rounded-xl object-cover" />
          <h1 className="text-xl font-bold">Tendit</h1>
        </div>

        <Card>
          <Tabs defaultValue="login">
            <CardHeader>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login" data-testid="tab-login">{t("auth.signIn")}</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">{t("auth.signUp")}</TabsTrigger>
              </TabsList>
            </CardHeader>

            <CardContent>
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <CardDescription className="mb-4">{t("auth.signInDesc")}</CardDescription>
                  <div className="space-y-2">
                    <Label htmlFor="login-email">{t("auth.email")}</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      data-testid="input-login-email"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">{t("auth.password")}</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Min 6 characters"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      data-testid="input-login-password"
                      dir="ltr"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login">
                    {isLoading ? t("auth.signingIn") : t("auth.signIn")}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <CardDescription className="mb-4">{t("auth.signUpDesc")}</CardDescription>
                  <div className="space-y-2">
                    <Label htmlFor="reg-username">{t("auth.username")}</Label>
                    <Input
                      id="reg-username"
                      type="text"
                      placeholder="username"
                      value={regUsername}
                      onChange={(e) => setRegUsername(e.target.value)}
                      required
                      data-testid="input-reg-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-email">{t("auth.email")}</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="you@example.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      required
                      data-testid="input-reg-email"
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-password">{t("auth.password")}</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      placeholder="Min 6 characters"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                      data-testid="input-reg-password"
                      dir="ltr"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-register">
                    {isLoading ? t("auth.creatingAccount") : t("auth.createAccount")}
                  </Button>
                </form>
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
