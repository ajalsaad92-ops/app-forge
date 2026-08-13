import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const createAPKProject = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ 
    name: z.string(),
    packageName: z.string().optional()
  }).parse(data))
  .handler(async ({ data, context }) => {
    // Note: In a real app, we'd get the user from the session
    // For this prototype, we'll use a placeholder or handle auth in middleware
    
    const { data: project, error } = await supabaseAdmin
      .from("apk_projects")
      .insert({
        name: data.name,
        package_name: data.packageName,
        user_id: "00000000-0000-0000-0000-000000000000", // Placeholder
      })
      .select()
      .single();

    if (error) throw error;
    return project;
  });

export const getProjectFiles = createServerFn({ method: "GET" })
  .inputValidator((data) => z.object({ projectId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { data: files, error } = await supabaseAdmin
      .from("apk_files")
      .select("*")
      .eq("project_id", data.projectId);

    if (error) throw error;
    return files;
  });
