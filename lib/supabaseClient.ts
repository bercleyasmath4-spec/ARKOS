
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ekynmhyxbhdzcakfygud.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVreW5taHl4YmhkemNha2Z5Z3VkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNTgxMDIsImV4cCI6MjA4NjgzNDEwMn0.0Yd3nyCyxxiMpn-eDhtARvsLDxNNQ9hfx9FuFgzSijM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
