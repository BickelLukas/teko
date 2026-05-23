import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  SelectRoot,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { fetchMe, updatePreferences } from "@/lib/api";

const FormSchema = z.object({
  display_name: z.string().optional(),
  notification_time: z
    .string()
    .regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM format (e.g. 08:00)")
    .optional(),
});
type FormValues = z.infer<typeof FormSchema>;

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [locale, setLocale] = useState("en");

  const { data: me, isLoading } = useQuery({ queryKey: ["me"], queryFn: fetchMe });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema) });

  useEffect(() => {
    if (me) {
      reset({
        display_name: me.display_name ?? "",
        notification_time: me.notification_time ?? "",
      });
      setLocale(me.locale ?? "en");
    }
  }, [me, reset]);

  const saveMutation = useMutation({
    mutationFn: (data: FormValues) =>
      updatePreferences({
        locale,
        display_name: data.display_name ? data.display_name : null,
        notification_time: data.notification_time ? data.notification_time : null,
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardContent className="space-y-5 pt-5">
          <div>
            <p className="mb-0.5 text-xs font-medium text-muted-foreground">Signed in as</p>
            <p className="text-sm font-medium">{me?.name}</p>
            <p className="text-xs text-muted-foreground">{me?.ha_user_id}</p>
          </div>

          <form onSubmit={handleSubmit((data) => saveMutation.mutate(data))} className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium">
                Display name
                <span className="ml-1 text-muted-foreground">(overrides HA name)</span>
              </label>
              <Input placeholder={me?.name ?? ""} {...register("display_name")} />
              {errors.display_name && (
                <p className="mt-1 text-xs text-destructive">{errors.display_name.message}</p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Language</label>
              <SelectRoot value={locale} onValueChange={setLocale}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="de">Deutsch</SelectItem>
                </SelectContent>
              </SelectRoot>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">
                Notification time
                <span className="ml-1 text-muted-foreground">(not active yet)</span>
              </label>
              <Input placeholder="08:00" {...register("notification_time")} />
              {errors.notification_time && (
                <p className="mt-1 text-xs text-destructive">{errors.notification_time.message}</p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
              {saveMutation.isSuccess && <p className="text-xs text-muted-foreground">Saved.</p>}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
