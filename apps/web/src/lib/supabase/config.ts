/** Supabase now calls the client key "publishable"; older projects call it "anon". Both work the same way. */
export const supabaseKey = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabaseUrl = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
