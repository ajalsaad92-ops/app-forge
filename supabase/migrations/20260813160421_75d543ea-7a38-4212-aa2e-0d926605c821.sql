-- Table to track APK projects
CREATE TABLE public.apk_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    package_name TEXT,
    version_code TEXT,
    original_apk_url TEXT,
    modified_apk_url TEXT,
    status TEXT DEFAULT 'pending', -- pending, decompiled, building, completed, failed
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table for files within a project (simulated file system)
CREATE TABLE public.apk_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.apk_projects(id) ON DELETE CASCADE NOT NULL,
    file_path TEXT NOT NULL,
    content TEXT,
    is_modified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, file_path)
);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apk_projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apk_files TO authenticated;
GRANT ALL ON public.apk_projects TO service_role;
GRANT ALL ON public.apk_files TO service_role;

-- RLS
ALTER TABLE public.apk_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apk_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own projects" 
ON public.apk_projects FOR ALL TO authenticated 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage files of their projects" 
ON public.apk_files FOR ALL TO authenticated 
USING (EXISTS (
    SELECT 1 FROM public.apk_projects 
    WHERE id = project_id AND user_id = auth.uid()
));
