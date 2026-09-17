/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ARC_NETWORK?: 'mainnet' | 'testnet'
  readonly VITE_ARC_RPC_URL?: string
  readonly VITE_ESCROW_ADDRESS?: string
  readonly VITE_PUBLIC_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}
