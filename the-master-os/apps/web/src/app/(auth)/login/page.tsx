import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="rounded-2xl bg-white p-8 shadow-lg">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">The Master OS</h1>
        <p className="mt-2 text-gray-500">1인 100에이전트 자율 경영 시스템</p>
      </div>
      <div className="mt-8">
        <LoginForm />
      </div>
    </div>
  );
}
