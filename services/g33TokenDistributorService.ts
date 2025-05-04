import { ethers } from 'ethers';
import { collection, addDoc, getDocs, query, where, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente do arquivo .env
dotenv.config();

// Verificar se a chave privada está disponível
if (!process.env.DISTRIBUTOR_PRIVATE_KEY) {
  console.error("DISTRIBUTOR_PRIVATE_KEY não encontrada. Verifique o arquivo .env ou as configurações do ambiente.");
} else {
  console.log("DISTRIBUTOR_PRIVATE_KEY carregada com sucesso.");
}

// Removendo o carregamento de dotenv
// As variáveis de ambiente devem ser configuradas no ambiente de execução ou no arquivo .env.local

// Log para verificar se as variáveis de ambiente estão acessíveis
console.log("Variáveis de ambiente disponíveis:", Object.keys(process.env));

// ABI simplificado do contrato G33TokenDistributor
const DISTRIBUTOR_ABI = [
  "function distributeTokens(address donor, uint256 donationAmountUsd) external",
  "function getAvailableTokens() external view returns (uint256)",
  "function tokensDistributed(address donor) external view returns (uint256)",
  "function totalDonated(address donor) external view returns (uint256)",
  "function totalDistributedTokens() external view returns (uint256)",
  "function totalDonationsUsd() external view returns (uint256)"
];

// Lista de URLs RPC confiáveis para a rede Polygon
const POLYGON_RPC_URLS = [
  "https://polygon-rpc.com",
  "https://polygon.llamarpc.com",
  "https://rpc-mainnet.maticvigil.com",
  "https://polygon-mainnet.public.blastapi.io",
  "https://polygon-bor.publicnode.com",
  "https://polygon.meowrpc.com",
  "wss://polygon-mainnet.g.alchemy.com/v2/demo", // Alchemy WS público
  "wss://ws-matic-mainnet.chainstacklabs.com"   // ChainStack WS
];

// Lista de proxies CORS confiáveis que podem ajudar a contornar restrições de rede
const CORS_PROXIES = [
  "https://corsproxy.io/?",
  "https://cors-anywhere.herokuapp.com/",
  "https://api.allorigins.win/raw?url="
];

// Endpoint RPC confiável para usar com proxy
const RELIABLE_RPC_ENDPOINTS = [
  "https://polygon-rpc.com",
  "https://polygon.llamarpc.com"
];

// Endpoints locais para desenvolvimento
const LOCAL_RPC_URLS = [
  "http://127.0.0.1:8545", // Ganache / Hardhat padrão
  "http://localhost:8545"  // Alternativo
];

// Endereço do contrato distribuidor e token definidos via variável de ambiente
const DISTRIBUTOR_ADDRESS = process.env.G33_TOKEN_DISTRIBUTOR_ADDRESS || "0x137c762cb3eea5c8e5a6ed2fdf41dd47b5e13455";
const G33_TOKEN_ADDRESS = process.env.G33_TOKEN_ADDRESS || "0xc6099a207e9d2d37d1203f060d2e77c1e05008fa";

// Interface para registro de doações
interface TokenDonation {
  donorAddress: string;
  donationAmount: number; // valor em cripto
  usdValue: number; // valor convertido para USD
  tokenAmount: number; // quantidade de tokens a serem distribuídos
  transactionHash: string;
  network: string;
  cryptoSymbol: string;
  createdAt: Date;
  status: 'pending' | 'distributed' | 'failed';
  distributionTxHash?: string;
  error?: string; // Campo adicional para armazenar mensagens de erro
}

// Interface para RPC Endpoints
interface RpcEndpoint {
  url: string;
  network: {
    name: string;
    chainId: number;
  };
}

/**
 * Verifica se a aplicação está em uma rede com acesso à internet limitado
 * e que precisa usar fallbacks especiais
 */
async function isRestrictedNetwork(): Promise<boolean> {
  try {
    // Tenta acessar uma URL externa conhecida
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch('https://cloudflare.com', { 
      signal: controller.signal,
      method: 'HEAD'
    });
    clearTimeout(timeoutId);
    
    return !response.ok;
  } catch (error) {
    console.log('Detectada possível restrição de rede');
    return true;
  }
}

/**
 * Tenta conectar a um RPC através de um proxy CORS
 * @param baseRpcUrl URL base do RPC
 * @returns Provider conectado ou null se falhar
 */
async function createProxiedProvider(baseRpcUrl: string): Promise<ethers.providers.Provider | null> {
  for (const proxyUrl of CORS_PROXIES) {
    try {
      const fullUrl = `${proxyUrl}${baseRpcUrl}`;
      console.log(`🔄 Tentando conectar via proxy CORS: ${fullUrl}`);
      
      // Criar um provider com o URL do proxy
      const provider = new ethers.providers.JsonRpcProvider({
        url: fullUrl,
        headers: {
          "Origin": "https://gate33.com",
          "Referer": "https://gate33.com/"
        }
      });
      
      // Testar a conexão com timeout
      const testPromise = provider.getBlockNumber();
      const resultPromise = Promise.race([
        testPromise,
        new Promise<null>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 5000)
        )
      ]);
      
      const blockNumber = await resultPromise;
      console.log(`✅ Conectado com sucesso via proxy CORS. Bloco: ${blockNumber}`);
      return provider;
    } catch (error) {
      console.warn(`❌ Falha ao conectar via proxy CORS: ${proxyUrl}`, 
        error instanceof Error ? error.message : String(error));
    }
  }
  
  return null;
}

/**
 * Serviço para interagir com o contrato G33TokenDistributor
 * Este serviço gerencia a distribuição automática de tokens G33 para doadores
 */
class G33TokenDistributorService {
  private provider: ethers.providers.Provider | null = null;
  private wallet: ethers.Wallet | null = null;
  private contract: ethers.Contract | null = null;
  private distributorAddress: string | null = null;
  private isInitialized: boolean = false;
  private initializationError: string | null = null;
  private lastInitAttempt: number = 0;
  private privateKey: string | null = null;
  private isDevMode: boolean = process.env.NODE_ENV === 'development';

  constructor() {
    this.init().catch(console.error);
  }

  /**
   * Tenta criar um provider confiável para a rede Polygon
   */
  private async createProvider(): Promise<ethers.providers.Provider | null> {
    const providerUrls = [
      { url: "https://polygon-rpc.com" },
      { url: "https://rpc.ankr.com/polygon" },
      { url: "https://1rpc.io/matic" }
    ];

    // Tentar conexão direta primeiro
    for (const {url} of providerUrls) {
      try {
        console.log(`🔄 Tentando conectar ao RPC: ${url}`);
        
        // Criar provider com timeout
        const provider = new ethers.providers.JsonRpcProvider({ 
          url,
          timeout: 10000 // 10 segundos de timeout
        });
        
        // Testar a conexão com timeout adicional
        const blockNumber = await Promise.race([
          provider.getBlockNumber(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), 5000)
          )
        ]);
        
        console.log(`✅ Conectado com sucesso ao RPC ${url}. Bloco atual: ${blockNumber}`);
        return provider;
      } catch (error) {
        console.warn(`❌ Falha ao conectar ao RPC ${url}:`, error instanceof Error ? error.message : String(error));
      }
    }
    
    // Se todas as conexões diretas falharem, tentar via proxy CORS
    console.log("⚠️ Todas as conexões diretas falharam. Tentando via proxy CORS...");
    
    for (const baseRpcUrl of RELIABLE_RPC_ENDPOINTS) {
      const proxiedProvider = await createProxiedProvider(baseRpcUrl);
      if (proxiedProvider) {
        return proxiedProvider;
      }
    }
    
    // Se ainda falhar, tentar conexão com fallback de HTTP customizado
    try {
      console.log("⚠️ Tentando conexão com fallback HTTP customizado...");
      
      // Criar um provider customizado que usa fetch diretamente
      const url = "https://polygon-rpc.com";
      
      // Definir uma função de fetch customizada
      const myCustomFetch = async (url: string, payload: string): Promise<string> => {
        try {
          const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://gate33.com',
            'Referer': 'https://gate33.com/'
          };
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: payload,
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          return await response.text();
        } catch (error) {
          console.error("Erro no fetch customizado:", error);
          throw error;
        }
      };
      
      // Usar o JsonRpcProvider com conexão básica
      const customProvider = new ethers.providers.JsonRpcProvider(url);
      
      // Substituir a função de envio de solicitação do provider
      const originalSend = customProvider.send;
      customProvider.send = async (method: string, params: Array<any>): Promise<any> => {
        try {
          console.log(`Chamando método ${method} com fetch customizado`);
          
          const payload = JSON.stringify({
            method,
            params,
            id: Math.floor(Math.random() * 1000000),
            jsonrpc: "2.0"
          });
          
          const result = await myCustomFetch(url, payload);
          const json = JSON.parse(result);
          
          if (json.error) {
            console.error(`Erro RPC: ${json.error.message || JSON.stringify(json.error)}`);
            throw new Error(json.error.message || "Erro desconhecido");
          }
          
          return json.result;
        } catch (error) {
          console.error("Erro ao enviar requisição RPC:", error);
          // Tentar o método original em caso de falha
          return originalSend(method, params);
        }
      };
      
      // Testar a conexão
      const blockNumber = await customProvider.getBlockNumber();
      console.log(`✅ Conectado com sucesso usando fetch customizado. Bloco: ${blockNumber}`);
      return customProvider;
    } catch (error) {
      console.error("❌ Falha também na conexão com fetch customizado:", 
        error instanceof Error ? error.message : String(error));
    }
    
    // Se em desenvolvimento, criar um provider fake para testes
    if (this.isDevMode) {
      console.warn("🔶 MODO DE DESENVOLVIMENTO: Criando provider simulado para testes");
      
      // Criar um provider simulado que retorna valores fixos para testes
      const fakeProvider = {
        getNetwork: async () => ({ chainId: 137, name: "polygon" }),
        getBlockNumber: async () => 42000000,
        getGasPrice: async () => ethers.utils.parseUnits("30", "gwei"),
        getBalance: async () => ethers.utils.parseEther("10"),
        getTransactionCount: async () => 0,
        call: async () => "0x",
        estimateGas: async () => ethers.BigNumber.from(200000),
        sendTransaction: async (tx: string) => ({ 
          hash: "0x" + "1".repeat(64),
          wait: async () => ({ status: 1, gasUsed: ethers.BigNumber.from(150000) })
        }),
        // Outros métodos necessários para testes
        getFeeData: async () => ({
          maxFeePerGas: ethers.utils.parseUnits("50", "gwei"),
          maxPriorityFeePerGas: ethers.utils.parseUnits("30", "gwei"),
          gasPrice: ethers.utils.parseUnits("35", "gwei")
        }),
      } as unknown as ethers.providers.Provider;
      
      return fakeProvider;
    }

    return null;
  }

  /**
   * Testa a conectividade com um endpoint RPC
   */
  private async testRpcEndpoint(url: string): Promise<{success: boolean, latency?: number, error?: string}> {
    const start = Date.now();
    
    try {
      // Primeiro testa se consegue fazer uma requisição HTTP básica
      console.log(`🔍 Testando conectividade HTTP básica para ${url}...`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_blockNumber',
            params: [],
            id: 1
          }),
          headers: {
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          return {
            success: false,
            latency: Date.now() - start,
            error: `HTTP ${response.status}: ${response.statusText}`
          };
        }
        
        const data = await response.json();
        console.log(`✅ RPC ${url} respondeu em ${Date.now() - start}ms`);
        return {
          success: true,
          latency: Date.now() - start
        };
        
      } catch (fetchError) {
        if (fetchError instanceof Error) {
          if (fetchError.name === 'AbortError') {
            return {
              success: false,
              error: 'Timeout'
            };
          }
          return {
            success: false,
            error: fetchError.message
          };
        }
        return {
          success: false,
          error: 'Unknown error occurred'
        };
      }
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Testa todos os RPCs disponíveis e retorna um relatório
   */
  private async testAllRpcs(): Promise<RpcEndpoint[]> {
    const endpoints: RpcEndpoint[] = [
      {
        url: "https://polygon-rpc.com",
        network: { name: "polygon", chainId: 137 }
      },
      {
        url: "https://rpc.ankr.com/polygon",
        network: { name: "polygon", chainId: 137 }
      },
      {
        url: "https://polygon.llamarpc.com",
        network: { name: "polygon", chainId: 137 }
      }
    ];
    
    console.log("\n🔍 Iniciando teste de conectividade RPC...");
    
    const workingEndpoints: RpcEndpoint[] = [];
    
    for (const endpoint of endpoints) {
      console.log(`\nTestando ${endpoint.url}...`);
      const result = await this.testRpcEndpoint(endpoint.url);
      
      if (result.success) {
        console.log(`✅ ${endpoint.url}: OK (${result.latency}ms)`);
        workingEndpoints.push(endpoint);
      } else {
        console.log(`❌ ${endpoint.url}: Falha - ${result.error}`);
      }
    }
    
    console.log("\nTeste de conectividade RPC concluído.");
    return workingEndpoints;
  }

  /**
   * Obtém a chave privada de várias fontes possíveis
   * @returns A chave privada ou null se não encontrada
   */
  private getPrivateKey(): string | null {
    // Log para debug
    console.log("Buscando chave privada do distribuidor...");
    
    // Verificar se a variável DISTRIBUTOR_PRIVATE_KEY está acessível
    if (process.env.DISTRIBUTOR_PRIVATE_KEY) {
      console.log("DISTRIBUTOR_PRIVATE_KEY encontrada no ambiente de execução.");
    } else {
      console.error("DISTRIBUTOR_PRIVATE_KEY não encontrada no ambiente de execução.");
    }
    
    // Lista de possíveis nomes de variáveis de ambiente para a chave privada
    const possibleEnvKeys = [
      "DISTRIBUTOR_PRIVATE_KEY",
      "PRIVATE_KEY_DISTRIBUTOR",
      "TOKEN_DISTRIBUTOR_KEY",
      "POLYGON_DISTRIBUTOR_KEY",
      "WALLET_PRIVATE_KEY",
      "PRIVATE_KEY",
      "OWNER_PRIVATE_KEY"
    ];
    
    // Verificar cada uma das variáveis de ambiente possíveis
    for (const keyName of possibleEnvKeys) {
      if (process.env[keyName]) {
        let privateKey = process.env[keyName];
        console.log(`Encontrada chave privada em variável: ${keyName}`);
        
        // Adicionar prefixo 0x se necessário
        if (!privateKey.startsWith('0x')) {
          privateKey = '0x' + privateKey;
          console.log("Adicionado prefixo '0x' à chave privada");
        }
        
        return privateKey;
      }
    }
    
    // APENAS EM DESENVOLVIMENTO: Se não encontrou chave e estamos em desenvolvimento, usar simulada
    if (this.isDevMode) {
      throw new Error("Chave privada não encontrada. Verifique as variáveis de ambiente.");
    }
    
    return null;
  }

  /**
   * Inicializa o serviço carregando configurações e conectando ao contrato
   * @param forceInit Se verdadeiro, força a inicialização mesmo se uma tentativa recente foi feita
   */
  async init(forceInit: boolean = false): Promise<void> {
    try {
      console.log("🔄 Iniciando G33TokenDistributorService...");
      
      // Evitar tentativas frequentes de inicialização apenas quando não forçado
      const now = Date.now();
      if (!forceInit && this.lastInitAttempt > 0 && (now - this.lastInitAttempt) < 60000) {
        console.log("Tentativa de inicialização muito recente, aguardando antes de tentar novamente");
        return;
      }
      
      this.lastInitAttempt = now;
      this.initializationError = null;
      
      // Log detalhado do modo de execução
      console.log("Iniciando G33TokenDistributorService no modo:", this.isDevMode ? "desenvolvimento" : "produção");
      console.log("Ambiente NODE_ENV:", process.env.NODE_ENV);
      console.log("NEXT_PUBLIC_DEVELOPMENT_MODE:", process.env.NEXT_PUBLIC_DEVELOPMENT_MODE);
      
      // Debug para verificar variáveis de ambiente
      console.log("Variáveis de ambiente relacionadas:", Object.keys(process.env).filter(key => 
        key.includes('DISTRIBUTOR') || 
        key.includes('TOKEN') || 
        key.includes('PROVIDER') ||
        key.includes('RPC') ||
        key.includes('PRIVATE')
      ));
      
      // Log para listar todas as variáveis de ambiente disponíveis
      console.log("Variáveis de ambiente disponíveis:", Object.keys(process.env));
      
      // Obter a chave privada
      this.privateKey = this.getPrivateKey();
      
      // Verificar se a chave privada foi encontrada
      if (!this.privateKey) {
        throw new Error("Chave privada do distribuidor não encontrada. Verifique as variáveis de ambiente.");
      }
      
      // Verificar o formato da chave privada
      if (!/^0x[a-fA-F0-9]{64}$/.test(this.privateKey)) {
        console.warn(`⚠️ Aviso: Chave privada parece estar no formato incorreto. Comprimento: ${this.privateKey.length}, esperado: 66 caracteres.`);
        
        // Se estiver em desenvolvimento, corrigir a chave
        if (this.isDevMode) {
          this.privateKey = "0x1234567890123456789012345678901234567890123456789012345678901234";
          console.log("⚠️ [DESENVOLVIMENTO] Substituindo com chave simulada devido a formato incorreto.");
        } else {
          throw new Error("Formato inválido da chave privada do distribuidor. Verifique as variáveis de ambiente.");
        }
      }
      
      // Retry logic for Firestore operations
      const maxRetries = 3;
      let retryCount = 0;
      let configDoc = null;

      while (retryCount < maxRetries) {
        try {
          configDoc = await getDoc(doc(db, "settings", "contractConfig"));
          if (configDoc.exists()) break;
          throw new Error("Documento de configuração do contrato não encontrado no Firebase");
        } catch (error) {
          retryCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`Tentativa ${retryCount} de obter configuração do contrato falhou:`, errorMessage);
          if (retryCount >= maxRetries) throw new Error("Falha ao obter configuração do contrato após várias tentativas");
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Esperar 2 segundos antes de tentar novamente
        }
      }
      
      // Use environment variable or fallback for distributor address
      this.distributorAddress = DISTRIBUTOR_ADDRESS;
      console.log(`Endereço do distribuidor definido: ${this.distributorAddress}`);

      if (!this.distributorAddress) {
        throw new Error("Endereço do distribuidor não está configurado.");
      }
      
      console.log("Configurando provider para a rede Polygon...");
      try {
        this.provider = await this.createProvider();
        
        if (!this.provider) {
          throw new Error("Não foi possível estabelecer conexão com nenhum RPC. Verifique os endpoints e a conectividade de rede.");
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Erro ao configurar provider:", errorMessage);
        throw new Error("Erro crítico ao configurar provider para a rede Polygon.");
      }
      
      if (!this.provider) {
        throw new Error("Não foi possível estabelecer conexão com nenhum RPC");
      }

      // Configurar wallet com provider já estabelecido
      if (this.privateKey) {
        this.wallet = new ethers.Wallet(this.privateKey, this.provider);
        console.log("✅ Wallet configurada com sucesso");
      }
      
      try {
        this.provider = this.provider;
        this.wallet = new ethers.Wallet(this.privateKey, this.provider);
        console.log("Chave privada configurada com sucesso.");
        
        // Log da chave privada usada para inicializar o wallet
        console.log(`Chave privada usada: ${this.privateKey}`);
        // Log do endereço gerado a partir da chave privada
        const generatedWalletAddress = await this.wallet.getAddress();
        console.log(`Endereço gerado a partir da chave privada: ${generatedWalletAddress}`);

        // Removendo redefinição da variável 'walletAddress'
        console.log(`Carteira do distribuidor configurada: ${generatedWalletAddress.substring(0, 6)}...${generatedWalletAddress.substring(generatedWalletAddress.length - 4)}`);
        
        // Conectar ao contrato
        this.contract = new ethers.Contract(this.distributorAddress, DISTRIBUTOR_ABI, this.wallet);
        
        // Verificar se o contrato está acessível
        try {
          const availableTokens = await this.contract.getAvailableTokens();
          console.log(`Contrato do distribuidor conectado com sucesso. Tokens disponíveis: ${ethers.utils.formatEther(availableTokens)}`);
          this.isInitialized = true;
        } catch (contractError: unknown) {
          const errorMessage = contractError instanceof Error 
            ? contractError.message
            : "Erro desconhecido ao acessar funções do contrato";
            
          throw new Error(`Erro ao acessar funções do contrato: ${errorMessage}`);
        }
      } catch (walletError: unknown) {
        const errorMessage = walletError instanceof Error 
          ? walletError.message
          : "Erro desconhecido";
          
        console.error("Erro ao criar carteira com a chave privada fornecida:", errorMessage);
        throw new Error(`Erro ao criar carteira: ${errorMessage}. Verifique se a chave privada está no formato correto.`);
      }
      
      // Verificar o chainId da rede conectada
      const network = await this.provider!.getNetwork();
      console.log(`Conectado à rede: ${network.name} (chainId: ${network.chainId})`);
      if (network.chainId !== 137) {
        throw new Error(`Provedor RPC conectado à rede errada. Esperado: Polygon Mainnet (chainId 137), Atual: ${network.chainId}`);
      }

      return;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.initializationError = errorMessage;

      // Handle offline mode gracefully
      if (errorMessage.includes("offline")) {
        console.error("Firestore está offline. O serviço será inicializado em modo limitado.");
        this.isInitialized = false; // Marcar como não inicializado, mas sem lançar erro crítico
      } else {
        console.error("Erro ao inicializar G33TokenDistributorService:", errorMessage);
        this.isInitialized = false;
      }
    }
  }

  /**
   * Verifica se o serviço está inicializado e pronto para uso
   * @returns Verdadeiro se o serviço estiver inicializado
   */
  private async ensureInitialized(): Promise<boolean> {
    if (this.isInitialized) return true;
    
    // Tentar inicializar novamente
    await this.init();
    return this.isInitialized;
  }
  
  /**
   * Verifica se o serviço está inicializado (método público)
   * @returns Status de inicialização do serviço
   */
  public checkIsInitialized(): boolean {
    return this.isInitialized;
  }
  
  /**
   * Obtém o erro de inicialização, se houver
   * @returns Mensagem de erro ou null
   */
  public getInitializationError(): string | null {
    return this.initializationError;
  }

  /**
   * Verifica se um endereço está autorizado como distribuidor no contrato
   * @param address Endereço a ser verificado
   * @returns true se o endereço está autorizado, false caso contrário
   */
  async isAuthorizedDistributor(address: string): Promise<boolean> {
    try {
      if (!(await this.ensureInitialized())) {
        return false;
      }
      
      // Criar um contrato com interface estendida que inclui o método distributors
      const extendedContract = new ethers.Contract(
        this.distributorAddress!,
        [
          ...DISTRIBUTOR_ABI,
          "function distributors(address) external view returns (bool)",
          "function owner() external view returns (address)"
        ],
        // Corrigindo o problema de tipo, garantindo que provider não seja null
        this.provider || undefined
      );
      
      // Verificar se o endereço é um distribuidor autorizado
      const isDistributor = await extendedContract.distributors(address);
      if (isDistributor) {
        console.log(`✅ O endereço ${address} é um distribuidor autorizado`);
        return true;
      }
      
      // Verificar se o endereço é o proprietário do contrato
      const owner = await extendedContract.owner();
      if (owner.toLowerCase() === address.toLowerCase()) {
        console.log(`✅ O endereço ${address} é o proprietário do contrato`);
        return true;
      }
      
      console.warn(`⚠️ O endereço ${address} NÃO é um distribuidor autorizado nem o proprietário`);
      return false;
    } catch (error) {
      console.error(`Erro ao verificar se ${address} é um distribuidor autorizado:`, error);
      return false;
    }
  }

  /**
   * Distribui tokens G33 para um doador com base no valor da doação em USD
   * @param donorAddress Endereço do doador
   * @param usdValue Valor da doação em USD (número decimal)
   * @param waitForConfirmation Se verdadeiro, aguarda confirmação da transação
   * @returns Hash da transação de distribuição ou null se falhar
   */
  async distributeTokens(donorAddress: string, usdValue: number, waitForConfirmation: boolean = false): Promise<string | null> {
    try {
      if (!(await this.ensureInitialized())) {
        throw new Error(`Serviço não inicializado. Erro: ${this.initializationError || "Desconhecido"}`);
      }
      
      // VALIDAÇÃO CRÍTICA: O contrato G33TokenDistributorV2 não processa valores menores que 1 USD
      // Isso ocorre porque o contrato faz: tokenAmount = donationAmountUsd / 100 (divisão inteira)
      // Se o valor for menor que 100 (1 USD), o resultado será 0 tokens
      if (usdValue < 1) {
        throw new Error(`Valor mínimo para distribuição de tokens é 1 USD. Valor informado: ${usdValue} USD`);
      }

      // VALIDAÇÃO CRÍTICA: Garantir que o valor enviado é um inteiro
      // O contrato não suporta frações de token
      if (usdValue % 1 !== 0) {
        console.warn(`⚠️ Aviso: O valor USD ${usdValue} contém decimais e será arredondado para ${Math.floor(usdValue)} USD`);
        usdValue = Math.floor(usdValue);
      }
      
      // Verificar se há tokens disponíveis
      const availableTokensWei = await this.contract!.getAvailableTokens();
      const availableTokens = parseFloat(ethers.utils.formatEther(availableTokensWei));
      const tokensNeeded = usdValue; // 1 token por 1 USD
      
      console.log(`Distribuição de tokens: ${tokensNeeded} tokens necessários, ${availableTokens} tokens disponíveis`);
      
      if (availableTokens < tokensNeeded) {
        throw new Error(`Tokens insuficientes no contrato distribuidor. Disponível: ${availableTokens}, Necessário: ${tokensNeeded}`);
      }
      
      // Escalar valor USD para o formato esperado pelo contrato G33TokenDistributorV2
      // O contrato espera o valor em centavos (x100) para precisão de 2 casas decimais
      const usdValueScaled = Math.round(usdValue * 100); // Usar Math.round para evitar problemas de arredondamento

      console.log(`Valor USD original: ${usdValue}`);
      console.log(`Valor escalado para o contrato (x100): ${usdValueScaled}`);
      console.log(`O doador receberá ${usdValue} tokens completos G33`);
      
      // NOVO: Validar endereço do doador
      if (!ethers.utils.isAddress(donorAddress)) {
        throw new Error(`Endereço do doador inválido: ${donorAddress}`);
      }
      
      // Verificar o endereço da carteira do distribuidor para diagnóstico
      const walletAddress = await this.wallet!.getAddress();
      console.log(`Carteira do distribuidor que assinará a transação: ${walletAddress}`);
      
      // Verificar se o endereço do contrato distribuidor está definido
      if (!this.distributorAddress) {
        throw new Error("Endereço do contrato distribuidor não está definido");
      }
      
      // VERIFICAÇÃO: Verificar se o endereço do contrato e o endereço do wallet são iguais
      // Isso pode acontecer em configuração incorreta e causar erros de "insufficient funds"
      if (this.distributorAddress.toLowerCase() === walletAddress.toLowerCase()) {
        console.warn("⚠️ ALERTA: O endereço da carteira e o endereço do contrato são iguais!");
        console.warn("Este é um problema de configuração que pode causar erros de 'insufficient funds'");
        console.warn("O contrato em si não deve ser usado como assinador de transações");
      }
      
      // NOVO: Verificar se já houve uma transação recente idêntica
      console.log("Verificando histórico de doações recentes...");
      try {
        const donationRegistry = collection(db, 'tokenDonations');
        const q = query(
          donationRegistry,
          where('donorAddress', '==', donorAddress),
          where('usdValue', '==', usdValue),
          where('status', 'in', ['distributed', 'pending']),
        );
        
        const existingDonations = await getDocs(q);
        if (!existingDonations.empty) {
          const recentDonations = existingDonations.docs.filter(doc => {
            const donation = doc.data();
            const timestamp = donation.createdAt?.toDate?.() || new Date(donation.createdAt);
            const minutesSince = (Date.now() - timestamp.getTime()) / (1000 * 60);
            return minutesSince < 5; // Doações nos últimos 5 minutos
          });
          
          if (recentDonations.length > 0) {
            const recentDonation = recentDonations[0].data();
            console.warn(`🚨 Encontrada doação muito recente (últimos 5 minutos) para o mesmo endereço e valor`);
            if (recentDonation.distributionTxHash) {
              console.warn(`Hash da transação recente: ${recentDonation.distributionTxHash}`);
              console.warn("Aguardando 10 segundos para evitar problemas de nonce...");
              await new Promise(resolve => setTimeout(resolve, 10000));
            }
          }
        }
      } catch (dbError) {
        console.warn("Erro ao verificar doações anteriores:", dbError);
        // Não interromper o fluxo por falha na verificação de duplicidade
      }
      
      // NOVO: Verificar permissões da carteira como distribuidora
      try {
        const isAuthorized = await this.isAuthorizedDistributor(walletAddress);
        if (!isAuthorized) {
          throw new Error(`A carteira ${walletAddress} não está autorizada como distribuidora. A transação seria revertida.`);
        }
        console.log(`✅ Carteira autorizada como distribuidora!`);
      } catch (authError) {
        console.error("Erro ao verificar permissões de distribuidor:", authError);
        throw new Error(`Falha ao verificar permissões de distribuidor: ${authError instanceof Error ? authError.message : String(authError)}`);
      }
      
      // NOVO: Fazer uma simulação prévia para detectar erros
      try {
        console.log(`Realizando simulação prévia da transação...`);
        await this.contract!.callStatic.distributeTokens(donorAddress, usdValueScaled, {
          from: walletAddress
        });
        console.log("✅ Simulação prévia bem-sucedida! A transação deve funcionar.");
      } catch (simError: any) {
        // Extrair informação útil do erro de simulação
        console.error("❌ A simulação da transação falhou! Erro:", 
          simError instanceof Error ? simError.message : String(simError));
        
        // Analisar o erro para fornecer informações mais úteis
        let errorMessage = "Simulação falhou";
        
        if (simError.error?.message) {
          errorMessage = simError.error.message;
        } else if (simError.message) {
          errorMessage = simError.message;
        }
        
        if (errorMessage.includes("Insufficient tokens")) {
          throw new Error(`Tokens insuficientes no contrato distribuidor.`);
        } else if (errorMessage.includes("Not authorized")) {
          throw new Error(`Conta ${walletAddress} não tem permissão para distribuir tokens.`);
        } else if (errorMessage.includes("execution reverted")) {
          throw new Error(`Simulação falhou: ${errorMessage}. Verifique o saldo e permissões do contrato.`);
        }
        
        throw new Error(`Simulação prévia falhou: ${errorMessage}`);
      }
      
      // Método padrão: Usar a carteira configurada no serviço
      // ----------------------------------------------------- 
      console.log("Usando carteira configurada no serviço para distribuir tokens...");
      
      // Verificar saldo da carteira para gas
      console.log(`Verificando saldo da carteira que assina a transação: ${walletAddress}`);
      const walletBalance = await this.provider!.getBalance(walletAddress);
      console.log(`Saldo da carteira (direto do provedor RPC): ${ethers.utils.formatEther(walletBalance)} MATIC`);
      
      // Log do nó RPC usado
      if (this.provider instanceof ethers.providers.JsonRpcProvider) {
        console.log(`Usando nó RPC: ${this.provider.connection.url}`);
      }
      
      const ignoreBalanceCheck = true;
      
      // Obter fee data atual para garantir valores apropriados de gas
      const feeData = await this.provider!.getFeeData();
      console.log("Fees atuais da rede:", {
        maxFeePerGas: feeData.maxFeePerGas ? ethers.utils.formatUnits(feeData.maxFeePerGas, "gwei") + " gwei" : "N/A",
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? ethers.utils.formatUnits(feeData.maxPriorityFeePerGas, "gwei") + " gwei" : "N/A",
        gasPrice: feeData.gasPrice ? ethers.utils.formatUnits(feeData.gasPrice, "gwei") + " gwei" : "N/A"
      });
      
      // IMPORTANTE: Polygon exige pelo menos 25 gwei para maxPriorityFeePerGas (gas tip cap)
      // Erro mostra: minimum needed 25000000000 (25 gwei)
      // Vamos usar valores mais altos para garantir que a transação seja aceita
      const MIN_GAS_PRICE = ethers.utils.parseUnits("30", "gwei"); 
      const MIN_PRIORITY_FEE = ethers.utils.parseUnits("50", "gwei"); // Aumentado de 30 para 50
      const MIN_FEE_PER_GAS = ethers.utils.parseUnits("100", "gwei"); // Aumentado de 50 para 100
      
      // Usar o maior entre o valor mínimo e o sugerido pelo provider
      const gasPrice = feeData.gasPrice && feeData.gasPrice.gt(MIN_GAS_PRICE) 
        ? feeData.gasPrice 
        : MIN_GAS_PRICE;
        
      // Para transações EIP-1559 (tipo 2), usar maxFeePerGas e maxPriorityFeePerGas
      // Garantir que o minimo de 50 gwei para priority fee seja respeitado
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas && feeData.maxPriorityFeePerGas.gt(MIN_PRIORITY_FEE)
        ? feeData.maxPriorityFeePerGas
        : MIN_PRIORITY_FEE;
      
      const maxFeePerGas = feeData.maxFeePerGas && feeData.maxFeePerGas.gt(MIN_FEE_PER_GAS)
        ? feeData.maxFeePerGas
        : MIN_FEE_PER_GAS;
      
      // Aumentar o gas limit para garantir que haja gas suficiente
      const gasLimit = 300000; // Aumentado de 200000 para 300000
      
      // Calcular custo estimado (usando o maior valor possível)
      const estimatedCost = maxFeePerGas.mul(gasLimit);
      console.log(`Custo estimado: ${ethers.utils.formatEther(estimatedCost)} MATIC`);
      
      if (!ignoreBalanceCheck && walletBalance.lt(estimatedCost)) {
        throw new Error(`Saldo insuficiente para esta transação. Necessário: ${ethers.utils.formatEther(estimatedCost)} MATIC, Disponível: ${ethers.utils.formatEther(walletBalance)} MATIC`);
      }
      
      // Obter nonce
      const nonce = await this.provider!.getTransactionCount(walletAddress, "latest");
      
      // NOVO: usar diretamente o contrato em vez de construir a transação manualmente
      try {
        console.log(`Preparando chamada direta ao contrato com gasLimit ${gasLimit}...`);
        
        // Configurar gasLimit explicitamente
        const overrides = {
          maxFeePerGas,
          maxPriorityFeePerGas,
          gasLimit,
          nonce,
        };
        
        // Chamar o contrato diretamente em vez de construir a transação manualmente
        console.log(`Enviando transação via contrato.distributeTokens...`);
        const tx = await this.contract!.distributeTokens(donorAddress, usdValueScaled, overrides);
        console.log(`Transação enviada: ${tx.hash}`);
        
        // Aguardar confirmação se necessário
        if (waitForConfirmation) {
          console.log(`Aguardando confirmação da transação ${tx.hash}...`);
          
          // Definir timeout e máximo de tentativas para evitar espera infinita
          const maxAttempts = 30; // Aumentado o número de tentativas
          const delayBetweenAttempts = 5000; // 5 segundos entre tentativas
          let attempts = 0;
          
          // Função para esperar um recibo com timeout
          const waitForReceipt = async (): Promise<ethers.providers.TransactionReceipt | null> => {
            while (attempts < maxAttempts) {
              attempts++;
              try {
                const receipt = await this.provider!.getTransactionReceipt(tx.hash);
                if (receipt) {
                  return receipt;
                }
                
                console.log(`Tentativa ${attempts}/${maxAttempts}: Transação ainda pendente...`);
                await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
              } catch (error) {
                console.warn(`Erro ao verificar recibo (tentativa ${attempts}):`, error);
                await new Promise(resolve => setTimeout(resolve, delayBetweenAttempts));
              }
            }
            
            // Se chegou aqui, não conseguiu obter o recibo
            console.warn(`Tempo limite excedido (${maxAttempts * delayBetweenAttempts / 1000}s). A transação ainda pode ser confirmada posteriormente.`);
            return null;
          };
          
          const receipt = await waitForReceipt();
          if (receipt) {
            console.log(`Transação confirmada! Gas usado: ${receipt.gasUsed.toString()}`);
            
            // Verificar se a transação foi bem-sucedida
            if (receipt.status === 0) {
              console.error("❌ A transação foi confirmada, mas a execução do contrato falhou (execution reverted)!");
              console.log("Verifique a transação em: https://polygonscan.com/tx/" + tx.hash);
              
              // NOVO: Tentar novamente com outros parâmetros
              console.log("Tentando novamente com parâmetros diferentes...");
              
              // Esperar 10 segundos antes de tentar novamente
              await new Promise(resolve => setTimeout(resolve, 10000));
              
              // Incrementar o nonce para evitar substituir a transação anterior
              const newNonce = await this.provider!.getTransactionCount(walletAddress, "latest");
              
              // Aumentar o gas limit e as fees para ter certeza que vai funcionar
              const newOverrides = {
                maxFeePerGas: ethers.utils.parseUnits("150", "gwei"),
                maxPriorityFeePerGas: ethers.utils.parseUnits("100", "gwei"),
                gasLimit: 500000,
                nonce: newNonce,
              };
              
              console.log("Enviando nova tentativa com configurações:", {
                maxFeePerGas: ethers.utils.formatUnits(newOverrides.maxFeePerGas, "gwei") + " gwei",
                maxPriorityFeePerGas: ethers.utils.formatUnits(newOverrides.maxPriorityFeePerGas, "gwei") + " gwei",
                gasLimit: newOverrides.gasLimit.toString(),
                nonce: newOverrides.nonce,
              });
              
              try {
                const retryTx = await this.contract!.distributeTokens(donorAddress, usdValueScaled, newOverrides);
                console.log(`Nova transação enviada: ${retryTx.hash}`);
                return retryTx.hash;
              } catch (retryError) {
                console.error("❌ Também falhou na segunda tentativa:", retryError);
                throw new Error("Execução do contrato falhou - execution reverted. A transferência de tokens não foi completada mesmo após nova tentativa.");
              }
            }
            
            // Verificar logs para confirmar que o evento TokensDistributed foi emitido
            let eventEmitted = false;
            if (receipt.logs && receipt.logs.length > 0) {
              for (const log of receipt.logs) {
                if (log.address.toLowerCase() === this.distributorAddress?.toLowerCase()) {
                  eventEmitted = true;
                  console.log("✅ Evento emitido pelo contrato distribuidor detectado");
                  break;
                }
              }
            }
            
            if (!eventEmitted) {
              console.warn("⚠️ Transação confirmada, mas nenhum evento do contrato distribuidor foi detectado");
              console.log("A transação pode ter falhado silenciosamente. Verifique em: https://polygonscan.com/tx/" + tx.hash);
            }
          } else {
            console.warn("Tempo limite excedido esperando confirmação. A transação ainda pode ser confirmada posteriormente.");
            console.log("Você pode verificar o status da transação em https://polygonscan.com/tx/" + tx.hash);
          }
        }
        
        return tx.hash;
      } catch (contractError: any) {
        console.error("❌ Erro ao chamar contrato.distributeTokens:", contractError);
        
        // Tentar extrair informações mais úteis do erro
        let errorMessage = "Erro ao chamar contrato";
        
        if (contractError.error?.message) {
          errorMessage = contractError.error.message;
        } else if (contractError.message) {
          errorMessage = contractError.message;
        }
        
        if (errorMessage.includes("gas required exceeds")) {
          throw new Error(`Erro no gas: ${errorMessage}. Aumente o gas limit para esta transação.`);
        } else if (errorMessage.includes("nonce")) { 
          throw new Error(`Erro no nonce: ${errorMessage}. Pode haver uma transação pendente.`);
        } else {
          throw new Error(`Erro ao distribuir tokens: ${errorMessage}`);
        }
      }
      
      // O código abaixo só é executado se a tentativa de usar o contrato diretamente falhar
      // -----------------------------------------------------------------------------
      
      // Preparar dados para a transação como fallback
      const ABI = ["function distributeTokens(address donor, uint256 donationAmountUsd)"];
      const iface = new ethers.utils.Interface(ABI);
      const calldata = iface.encodeFunctionData("distributeTokens", [donorAddress, usdValueScaled]);
      
      // Construir transação com parâmetros EIP-1559 adequados para Polygon
      const tx = {
        to: this.distributorAddress || undefined, // Convertendo null para undefined para satisfazer TransactionRequest
        maxFeePerGas: maxFeePerGas,
        maxPriorityFeePerGas: maxPriorityFeePerGas,
        gasLimit: ethers.utils.hexlify(gasLimit),
        data: calldata,
        nonce: nonce,
        chainId: 137, // Polygon mainnet
        type: 2 // Tipo EIP-1559
      };
      
      console.log("Enviando transação com configurações:", {
        maxFeePerGas: ethers.utils.formatUnits(maxFeePerGas, "gwei") + " gwei",
        maxPriorityFeePerGas: ethers.utils.formatUnits(maxPriorityFeePerGas, "gwei") + " gwei",
        gasLimit: gasLimit.toString(),
        nonce: nonce,
        tipo: "EIP-1559 (tipo 2)"
      });
      
      // Assinar e enviar
      console.log("Enviando transação manual (fallback method)...");
      const signedTx = await this.wallet!.signTransaction(tx);
      const submittedTx = await this.provider!.sendTransaction(signedTx);
      
      console.log(`Transação enviada: ${submittedTx.hash}`);
      
      // Aguardar confirmação se necessário
      if (waitForConfirmation) {
        console.log(`Aguardando confirmação da transação ${submittedTx.hash}...`);
        
        // Código de espera por confirmação...
        // ...existing code...
      }
      
      return submittedTx.hash;
    } catch (error: any) {
      console.error("❌ Erro ao distribuir tokens G33:", error);
      
      // Extrair detalhes do erro
      if (error.error?.body) {
        try {
          const errorBody = JSON.parse(error.error.body);
          console.error("Detalhes do erro blockchain:", {
            code: errorBody.error?.code,
            message: errorBody.error?.message,
            data: errorBody.error?.data
          });
          
          // Verificar se o erro é relacionado a gas price baixo
          if (errorBody.error?.message && errorBody.error.message.includes("gas tip cap")) {
            const errorMsg = errorBody.error.message;
            // Extrair o valor mínimo requerido
            const minGasMatch = errorMsg.match(/minimum needed (\d+)/);
            if (minGasMatch && minGasMatch[1]) {
              const minGasNeeded = parseInt(minGasMatch[1], 10);
              console.log(`⚠️ Gas tip cap muito baixo. Mínimo necessário: ${minGasNeeded / 1_000_000_000} gwei`);
              
              // Aqui você poderia implementar um retry automático com valor maior
              throw new Error(`Gas tip cap insuficiente. O mínimo necessário é ${minGasNeeded / 1_000_000_000} gwei. Tente novamente com um valor maior.`);
            }
          }
        } catch (parseError) {
          console.error("Erro ao processar detalhes do erro:", parseError);
        }
      }
      
      // Análise do erro mais precisa para gas price
      if (error.message) {
        if (error.message.includes("gas tip cap") || error.message.includes("underpriced")) {
          // Verificar se a mensagem inclui o valor mínimo necessário
          const minGasMatch = error.message.match(/minimum needed (\d+)/);
          if (minGasMatch && minGasMatch[1]) {
            const minGasNeeded = parseInt(minGasMatch[1], 10);
            const minGasInGwei = minGasNeeded / 1_000_000_000;
            console.log(`⚠️ Gas price muito baixo. Mínimo necessário: ${minGasInGwei} gwei`);
            throw new Error(`Transação com gas price muito baixo. A rede Polygon exige no mínimo ${minGasInGwei} gwei. Consulte https://polygonscan.com/gastracker para valores atuais.`);
          } else {
            throw new Error(`Transação com gas price muito baixo para a rede Polygon. Consulte https://polygonscan.com/gastracker para valores atuais.`);
          }
        } else if (error.code === "INSUFFICIENT_FUNDS") {
          throw new Error("Fundos insuficientes para enviar a transação. Por favor, adicione MATIC à carteira distribuidora.");
        } else if (error.code === "NONCE_EXPIRED") {
          throw new Error(`Erro de nonce: ${error.message}. Tente novamente.`);
        } else if (error.code === "REPLACEMENT_UNDERPRICED") {
          throw new Error(`Transação com gas price muito baixo. Aumente o gas price e tente novamente.`);
        }
      }
      
      // Erro genérico
      throw new Error(`Falha ao distribuir tokens G33: ${error.message || JSON.stringify(error)}`);
    }
  }

  /**
   * Registra uma doação e distribui tokens G33 automaticamente
   * @param donorAddress Endereço do doador
   * @param donationAmount Valor doado em criptomoeda
   * @param usdValue Valor equivalente em USD
   * @param tokenAmount Quantidade de tokens a distribuir
   * @param transactionHash Hash da transação de doação
   * @param network Rede da doação
   * @param cryptoSymbol Símbolo da criptomoeda usada
   * @returns Um objeto contendo o ID do documento no Firebase e o status da distribuição
   * @throws Error se a distribuição de tokens falhar
   */
  async processDonation(
    donorAddress: string,
    donationAmount: number,
    usdValue: number,
    tokenAmount: number,
    transactionHash: string,
    network: string,
    cryptoSymbol: string
  ): Promise<{id: string, success: boolean, distributionTxHash?: string, error?: string}> {
    // Criar objeto para registrar a doação
    const tokenDonation: TokenDonation = {
      donorAddress,
      donationAmount,
      usdValue,
      tokenAmount,
      transactionHash,
      network,
      cryptoSymbol,
      createdAt: new Date(),
      status: 'pending'
    };
    
    // Adicionar ao Firebase com status inicial 'pending'
    const docRef = await addDoc(collection(db, 'tokenDonations'), tokenDonation);
    const donationId = docRef.id;
    
    try {
      console.log(`Processando doação para distribuição de tokens: ${tokenAmount} G33 para ${donorAddress}`);
      
      // MUITO IMPORTANTE: Verificar inicialização antes de tentar distribuir
      if (!(await this.ensureInitialized())) {
        const errorMsg = `Serviço distribuidor não inicializado. Erro: ${this.initializationError || "Desconhecido"}`;
        console.error(errorMsg);
        
        // Atualizar o status da doação para 'failed'
        await updateDoc(docRef, {
          status: 'failed',
          error: errorMsg
        });
        
        // Lançar erro para interromper o processamento da doação
        throw new Error(errorMsg);
      }
      
      // Tentar distribuir os tokens
      const distributionTxHash = await this.distributeTokens(donorAddress, usdValue);
      
      if (!distributionTxHash) {
        const errorMsg = 'Falha na distribuição de tokens - transação blockchain não completada';
        console.error(errorMsg);
        
        // Atualizar o status da doação para 'failed'
        await updateDoc(docRef, {
          status: 'failed',
          error: errorMsg
        });
        
        // Lançar erro para interromper o processamento da doação
        throw new Error(errorMsg);
      }
      
      // Distribuição bem-sucedida - atualizar o registro
      await updateDoc(docRef, {
        status: 'distributed',
        distributionTxHash
      });
      
      console.log(`Doação processada e tokens distribuídos com sucesso: ${tokenAmount} G33 para ${donorAddress}`);
      
      // Retornar sucesso com o hash da transação de distribuição
      return {
        id: donationId,
        success: true,
        distributionTxHash
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
      console.error("Erro crítico ao processar distribuição de tokens:", errorMessage);
      
      // Atualizar status para falha
      await updateDoc(docRef, {
        status: 'failed',
        error: errorMessage
      });
      
      // Retornar falha e propagar o erro
      return {
        id: donationId,
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Obtém o total de tokens disponíveis para distribuição
   * @returns Quantidade de tokens disponíveis ou 0 se não for possível obter
   */
  async getAvailableTokens(): Promise<string> {
    try {
      if (!(await this.ensureInitialized())) {
        return "0";
      }
      
      const availableTokens = await this.contract!.getAvailableTokens();
      return ethers.utils.formatEther(availableTokens);
    } catch (error) {
      console.error("Erro ao obter tokens disponíveis:", error);
      return "0";
    }
  }

  /**
   * Obtém estatísticas de distribuição
   */
  async getDistributionStats() {
    try {
      if (!(await this.ensureInitialized())) {
        return {
          totalDistributed: "0",
          totalDonationsUsd: "0",
          availableTokens: "0"
        };
      }
      
      const [totalDistributed, totalDonationsUsd, availableTokens] = await Promise.all([
        this.contract!.totalDistributedTokens(),
        this.contract!.totalDonationsUsd(),
        this.contract!.getAvailableTokens()
      ]);
      
      return {
        totalDistributed: ethers.utils.formatEther(totalDistributed),
        // totalDonationsUsd é armazenado com 2 casas decimais extras (x100)
        totalDonationsUsd: (Number(totalDonationsUsd) / 100).toString(),
        availableTokens: ethers.utils.formatEther(availableTokens)
      };
    } catch (error) {
      console.error("Erro ao obter estatísticas de distribuição:", error);
      return {
        totalDistributed: "0",
        totalDonationsUsd: "0",
        availableTokens: "0"
      };
    }
  }

  /**
   * Obtém o total de tokens já distribuídos para um doador específico
   * @param donorAddress Endereço do doador
   */
  async getTokensDistributedToDonor(donorAddress: string): Promise<string> {
    try {
      if (!(await this.ensureInitialized())) {
        return "0";
      }
      
      const tokenAmount = await this.contract!.tokensDistributed(donorAddress);
      return ethers.utils.formatEther(tokenAmount);
    } catch (error) {
      console.error(`Erro ao obter tokens distribuídos para ${donorAddress}:`, error);
      return "0";
    }
  }

  /**
   * Obtém o recibo de uma transação pelo seu hash
   * @param txHash Hash da transação
   * @returns Recibo da transação ou null se não encontrado
   */
  async getTransactionReceipt(txHash: string): Promise<ethers.providers.TransactionReceipt | null> {
    try {
      if (!(await this.ensureInitialized())) {
        return null;
      }
      
      if (!this.provider) {
        console.error("Provider não disponível para verificar recibo da transação");
        return null;
      }
      
      return await this.provider.getTransactionReceipt(txHash);
    } catch (error) {
      console.error(`Erro ao obter recibo da transação ${txHash}:`, error);
      return null;
    }
  }
}

// Ensure the service is initialized only on the server side
if (typeof window !== "undefined") {
  console.error("G33TokenDistributorService não pode ser inicializado no cliente. Ignorando inicialização.");
  throw new Error("Execução no cliente detectada. Serviço não será inicializado.");
}

// Exportar a instância do serviço
export const g33TokenDistributorService = new G33TokenDistributorService();

// Atualizar o endereço do contrato distribuidor no Firebase
(async () => {
  try {
    const distributorAddress = "0x137c762cb3eea5c8e5a6ed2fdf41dd47b5e13455"; // Endereço do novo contrato G33TokenDistributorV2
    await updateDoc(doc(db, "settings", "contractConfig"), {
      tokenDistributorAddress: distributorAddress
    });
    console.log("Endereço do contrato distribuidor atualizado no Firebase");
  } catch (err) {
    console.error("Erro ao atualizar endereço do contrato no Firebase:", err);
  }
})();

console.log("--- Verificando contexto de execução ---");
console.log("process.env.NODE_ENV:", process.env.NODE_ENV);
console.log("process.env.DISTRIBUTOR_PRIVATE_KEY:", process.env.DISTRIBUTOR_PRIVATE_KEY ? "[REDACTED]" : "Não encontrada");

// Ensure DISTRIBUTOR_PRIVATE_KEY-dependent logic is skipped on the client side
if (typeof window !== "undefined") {
  console.error("Este código está sendo executado no lado do cliente. Variáveis de ambiente privadas não estão disponíveis no cliente.");
  throw new Error("Execução no cliente detectada. Lógica dependente de DISTRIBUTOR_PRIVATE_KEY será ignorada.");
}

if (typeof window !== "undefined") {
  console.error("Este código está sendo executado no lado do cliente. Variáveis de ambiente privadas não estão disponíveis no cliente.");
} else {
  console.log("Este código está sendo executado no lado do servidor.");
}

export default g33TokenDistributorService;