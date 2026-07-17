export type AuthUser = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export type AuthLoginResponse = {
  token: string;
  user: AuthUser;
};

export type AuthMeResponse = {
  user: AuthUser;
};

export type AuthStatusResponse = {
  jwtConfigured: boolean;
  registerAllowed: boolean;
  userCount: number;
  storage: string;
};

export type AuthRegisterBody = {
  email: string;
  password: string;
  name: string;
};

export type AuthLoginBody = {
  email: string;
  password: string;
};
