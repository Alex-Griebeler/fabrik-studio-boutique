import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentTrainerId } from "./useTrainerPayroll";
import { format } from "date-fns";
import { Geolocation } from "@capacitor/geolocation";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { toast } from "sonner";

export function useTrainerTodaySessions() {
  const { data: trainer } = useCurrentTrainerId();
  const today = format(new Date(), "yyyy-MM-dd");

  return useQuery({
    queryKey: ["trainer_today_sessions", trainer?.id, today],
    enabled: !!trainer?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("*, students(full_name)")
        .eq("trainer_id", trainer!.id)
        .eq("session_date", today)
        .in("status", ["scheduled", "completed"])
        .order("start_time", { ascending: true })
        .limit(50);

      if (error) throw error;
      return data;
    },
    refetchInterval: 30_000,
  });
}

export function useTrainerCheckin() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      sessionId: string;
      method: "manual" | "gps" | "photo";
      lat?: number;
      lng?: number;
      photoUrl?: string;
    }) => {
      const update: Record<string, unknown> = {
        trainer_checkin_at: new Date().toISOString(),
        trainer_checkin_method: params.method,
      };
      if (params.lat != null) {
        update.trainer_checkin_lat = params.lat;
        update.trainer_checkin_lng = params.lng;
      }
      // No status change on check-in — session stays as scheduled until completed

      const { error } = await supabase
        .from("sessions")
        .update(update)
        .eq("id", params.sessionId);

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trainer_today_sessions"] });
      toast.success("Check-in realizado com sucesso!");
    },
    onError: (err: Error) => {
      toast.error("Erro no check-in: " + err.message);
    },
  });
}

export async function requestGeolocation() {
  try {
    const perm = await Geolocation.requestPermissions();
    if (perm.location !== "granted") {
      throw new Error("Permissão de localização negada");
    }
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    // Fallback for web
    return new Promise<{ lat: number; lng: number }>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocalização não suportada"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        (err) => reject(new Error(err.message)),
        { enableHighAccuracy: true }
      );
    });
  }
}

export async function takeCheckinPhoto() {
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      quality: 70,
      width: 640,
    });
    return photo.dataUrl ?? null;
  } catch {
    // Fallback: use browser media API
    return null;
  }
}

export function useCompleteSession() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase
        .from("sessions")
        .update({ status: "completed" as const })
        .eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trainer_today_sessions"] });
      toast.success("Sessão finalizada!");
    },
  });
}
