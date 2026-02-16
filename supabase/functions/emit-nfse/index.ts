import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmitNfsePayload {
  invoice_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // --- JWT Validation ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    // --- End JWT Validation ---

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { invoice_id } = (await req.json()) as EmitNfsePayload;

    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "invoice_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Buscar fatura com dados do aluno
    const { data: invoice, error: invError } = await supabase
      .from("invoices")
      .select("*, student:students(full_name, cpf, email, address)")
      .eq("id", invoice_id)
      .single();

    if (invError || !invoice) {
      return new Response(
        JSON.stringify({ error: "Fatura não encontrada", details: invError?.message }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Verificar se já existe NF-e ativa para esta fatura
    const { data: existingNfse } = await supabase
      .from("nfse")
      .select("id, status")
      .eq("invoice_id", invoice_id)
      .not("status", "in", '("cancelled","error")')
      .maybeSingle();

    if (existingNfse) {
      return new Response(
        JSON.stringify({ error: "Já existe NF-e para esta fatura", nfse_id: existingNfse.id }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const student = invoice.student as Record<string, unknown>;
    const tomadorNome = (student?.full_name as string) ?? "Cliente";
    const tomadorCpf = (student?.cpf as string) ?? null;
    const tomadorEmail = (student?.email as string) ?? null;
    const tomadorEndereco = (student?.address as Record<string, string>) ?? null;

    // 3. Verificar se temos API key da Focusnfe
    const focusNfeToken = Deno.env.get("FOCUSNFE_API_KEY");
    const isMock = !focusNfeToken;

    let nfseData: Record<string, unknown>;

    if (isMock) {
      const mockNumber = `MOCK-${Date.now().toString(36).toUpperCase()}`;
      const mockExternalId = `mock_${crypto.randomUUID().slice(0, 8)}`;

      nfseData = {
        invoice_id,
        student_id: invoice.student_id,
        contract_id: invoice.contract_id,
        amount_cents: invoice.amount_cents,
        service_description: "Serviços de treinamento funcional",
        tomador_nome: tomadorNome,
        tomador_cpf: tomadorCpf,
        tomador_email: tomadorEmail,
        tomador_endereco: tomadorEndereco,
        nfse_number: mockNumber,
        external_id: mockExternalId,
        status: "authorized",
        authorization_date: new Date().toISOString(),
        pdf_url: `https://mock-nfse.example.com/pdf/${mockExternalId}`,
        xml_url: `https://mock-nfse.example.com/xml/${mockExternalId}`,
        verification_code: `VERIF-${mockNumber}`,
        api_response: {
          mock: true,
          message: "NF-e emitida em modo de simulação (sem API key Focusnfe configurada)",
        },
      };
    } else {
      const focusPayload = {
        data_emissao: new Date().toISOString(),
        natureza_operacao: "1",
        optante_simples_nacional: true,
        prestador: {
          cnpj: "",
          inscricao_municipal: "",
          codigo_municipio: "",
        },
        tomador: {
          cpf: tomadorCpf,
          razao_social: tomadorNome,
          email: tomadorEmail,
          endereco: tomadorEndereco
            ? {
                logradouro: tomadorEndereco.street ?? "",
                numero: tomadorEndereco.number ?? "",
                complemento: tomadorEndereco.complement ?? "",
                bairro: tomadorEndereco.neighborhood ?? "",
                codigo_municipio: tomadorEndereco.city_code ?? "",
                uf: tomadorEndereco.state ?? "",
                cep: tomadorEndereco.zip ?? "",
              }
            : undefined,
        },
        servico: {
          valor_servicos: (invoice.amount_cents / 100).toFixed(2),
          discriminacao: "Serviços de treinamento funcional",
          codigo_tributario_municipio: "",
          aliquota: 0,
          iss_retido: false,
        },
      };

      const ref = crypto.randomUUID().slice(0, 8);
      const focusUrl = `https://api.focusnfe.com.br/v2/nfse?ref=${ref}`;

      const focusResponse = await fetch(focusUrl, {
        method: "POST",
        headers: {
          Authorization: `Basic ${btoa(focusNfeToken + ":")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(focusPayload),
      });

      const focusData = await focusResponse.json();

      if (!focusResponse.ok) {
        nfseData = {
          invoice_id,
          student_id: invoice.student_id,
          contract_id: invoice.contract_id,
          amount_cents: invoice.amount_cents,
          service_description: "Serviços de treinamento funcional",
          tomador_nome: tomadorNome,
          tomador_cpf: tomadorCpf,
          tomador_email: tomadorEmail,
          tomador_endereco: tomadorEndereco,
          external_id: ref,
          status: "error",
          error_message: focusData?.mensagem || JSON.stringify(focusData),
          api_response: focusData,
        };
      } else {
        nfseData = {
          invoice_id,
          student_id: invoice.student_id,
          contract_id: invoice.contract_id,
          amount_cents: invoice.amount_cents,
          service_description: "Serviços de treinamento funcional",
          tomador_nome: tomadorNome,
          tomador_cpf: tomadorCpf,
          tomador_email: tomadorEmail,
          tomador_endereco: tomadorEndereco,
          external_id: ref,
          status: "processing",
          api_response: focusData,
        };
      }
    }

    // 4. Inserir NF-e no banco
    const { data: nfse, error: insertError } = await supabase
      .from("nfse")
      .insert(nfseData)
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Erro ao salvar NF-e", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        nfse,
        mock: isMock,
        message: isMock
          ? "NF-e emitida em modo simulação (configure FOCUSNFE_API_KEY para produção)"
          : "NF-e enviada para processamento",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Erro interno", details: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
