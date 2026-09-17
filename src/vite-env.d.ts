/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARC_NETWORK?: 'mainnet' | 'testnet'
  readonly VITE_ARC_RPC_URL?: string
  readonly VITE_ESCROW_ADDRESS?: string
  readonly VITE_PUBLIC_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_ESCROW_DEPLOY_BLOCK?: string
  readonly VITE_ESCROW_LEGACY?: string
  readonly VITE_CIRCLE_CLIENT_KEY?: string
  readonly VITE_CIRCLE_CLIENT_URL?: string
  readonly VITE_CIRCLE_SPONSOR_GAS?: 'true' | 'false'
}
