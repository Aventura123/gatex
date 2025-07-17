'use client';

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useWallet } from '../WalletProvider';
import web3Service from '../../services/web3Service';
import learn2earnContractService from '../../services/learn2earnContractService';

// Interfaces
interface Learn2EarnHealthInfo {
  learn2earnId: number;
  firebaseId: string;
  network: string;
  tokenAddress: string;
  tokenSymbol: string;
  totalTokens: ethers.BigNumber;
  claimedTokens: ethers.BigNumber;
  remainingTokens: ethers.BigNumber;
  participantCount: number;
  maxParticipants: number;
  estimatedRecovery: ethers.BigNumber;
  issues: string[];
  canRecover: boolean;
  startTime: number;
  endTime: number;
  active: boolean;
  contractAddress: string;
  transactionHash: string;
}

interface EmergencyOperation {
  id: string;
  timestamp: Date;
  network: string;
  learn2earnId: number;
  action: 'emergency_end';
  tokensRecovered: string;
  transactionHash: string;
  adminAddress: string;
  reason: string;
}

const EmergencyTokenPanel: React.FC = () => {
  const { walletAddress, currentNetwork, connectWallet } = useWallet();
  const [loading, setLoading] = useState(false);
  const [problematicLearn2Earns, setProblematicLearn2Earns] = useState<Learn2EarnHealthInfo[]>([]);
  const [operationHistory, setOperationHistory] = useState<EmergencyOperation[]>([]);
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [processingRecovery, setProcessingRecovery] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [supportedNetworks, setSupportedNetworks] = useState<string[]>([]);

  // Estados para estatísticas
  const [totalProblems, setTotalProblems] = useState(0);
  const [totalTokensAtRisk, setTotalTokensAtRisk] = useState(ethers.BigNumber.from(0));
  const [recoverableTokens, setRecoverableTokens] = useState(ethers.BigNumber.from(0));

  // Use currentNetwork from wallet provider instead of selectedNetwork
  const activeNetwork = currentNetwork?.toLowerCase();

  useEffect(() => {
    loadSupportedNetworks();
  }, []);

  useEffect(() => {
    // Only load data if wallet is connected and we have supported networks
    if (walletAddress && supportedNetworks.length > 0 && activeNetwork) {
      // Only load if current network is supported
      if (supportedNetworks.includes(activeNetwork)) {
        loadProblematicLearn2Earns();
        loadOperationHistory();
      } else {
        setError(`Network "${currentNetwork}" is not supported. Please switch to a supported network.`);
        setProblematicLearn2Earns([]);
        setTotalProblems(0);
        setTotalTokensAtRisk(ethers.BigNumber.from(0));
        setRecoverableTokens(ethers.BigNumber.from(0));
      }
    }
  }, [walletAddress, activeNetwork, supportedNetworks]);

  const loadSupportedNetworks = async () => {
    try {
      const networks = await learn2earnContractService.getSupportedNetworks();
      setSupportedNetworks(networks);
    } catch (error) {
      console.error('Error loading supported networks:', error);
      setError('Failed to load supported networks');
    }
  };

  const loadProblematicLearn2Earns = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const problematicData: Learn2EarnHealthInfo[] = [];
      
      // Ensure we have an active network
      if (!activeNetwork) {
        throw new Error('No active network available');
      }
      
      // Get contract address for the active network
      const contractData = await learn2earnContractService.getContractAddresses(activeNetwork);
      if (!contractData?.contractAddress) {
        console.warn(`No contract found for network: ${activeNetwork}`);
        setProblematicLearn2Earns([]);
        setTotalProblems(0);
        setTotalTokensAtRisk(ethers.BigNumber.from(0));
        setRecoverableTokens(ethers.BigNumber.from(0));
        setLoading(false);
        return;
      }

      // Get RPC provider for reading blockchain data
      const provider = web3Service.getProvider();
      if (!provider) {
        throw new Error('No provider available');
      }

      // Create contract instance for reading
      const contractInstance = new ethers.Contract(
        contractData.contractAddress,
        [
          "function learn2earns(uint256) external view returns (string memory id, address tokenAddress, uint256 tokenAmount, uint256 startTime, uint256 endTime, uint256 maxParticipants, uint256 participantCount, bool active)",
          "function learn2earnCount() external view returns (uint256)"
        ],
        provider
      );

      // Get total learn2earn count
      const totalCount = await contractInstance.learn2earnCount();
      console.log(`Checking ${totalCount.toString()} Learn2Earns on ${activeNetwork}`);

      // Check each Learn2Earn for problems
      for (let i = 0; i < totalCount.toNumber(); i++) {
        try {
          const onchainData = await contractInstance.learn2earns(i);
          const [firebaseId, tokenAddress, tokenAmount, startTime, endTime, maxParticipants, participantCount, active] = onchainData;
          
          if (tokenAddress === ethers.constants.AddressZero) {
            continue; // Skip uninitialized entries
          }

          const issues: string[] = [];
          let canRecover = false;

          // Check if Firebase document exists
          let firebaseDoc = null;
          try {
            if (firebaseId) {
              const docRef = doc(db, 'learn2earn', firebaseId);
              const docSnap = await getDoc(docRef);
              firebaseDoc = docSnap.exists() ? docSnap.data() : null;
            }
          } catch (e) {
            console.warn(`Error checking Firebase doc for ${firebaseId}:`, e);
          }

          // Issue 1: Contract exists but no Firebase document
          if (!firebaseDoc && active) {
            issues.push('Learn2Earn exists on blockchain but missing from database');
            canRecover = true;
          }

          // Issue 2: Campaign has ended but is still active
          const currentTime = Math.floor(Date.now() / 1000);
          if (active && currentTime > endTime.toNumber()) {
            issues.push('Campaign has expired but is still active');
            canRecover = true;
          }

          // Issue 3: No participants but tokens are locked
          if (active && participantCount.toNumber() === 0 && tokenAmount.gt(0)) {
            const timeSinceStart = currentTime - startTime.toNumber();
            if (timeSinceStart > 86400) { // 24 hours
              issues.push('No participants after 24+ hours');
              canRecover = true;
            }
          }

          // Issue 4: Very low participation
          if (active && maxParticipants.gt(0)) {
            const participationRate = (participantCount.toNumber() / maxParticipants.toNumber()) * 100;
            if (participationRate < 10 && currentTime > startTime.toNumber() + 86400) {
              issues.push(`Very low participation: ${participationRate.toFixed(1)}%`);
              canRecover = true;
            }
          }

          // Only add to problematic list if there are issues
          if (issues.length > 0) {
            // Get transaction hash from blockchain event
            const transactionHash = await getTransactionHashFromBlockchain(i, contractData.contractAddress, provider);

            // Calculate tokens that would be recovered
            const tokenPerParticipant = maxParticipants.gt(0) 
              ? tokenAmount.div(maxParticipants) 
              : tokenAmount.div(participantCount.gt(0) ? participantCount : 1);
            
            const distributedTokens = tokenPerParticipant.mul(participantCount);
            const remainingTokens = tokenAmount.gt(distributedTokens) ? tokenAmount.sub(distributedTokens) : ethers.BigNumber.from(0);

            // Get token symbol
            const tokenSymbol = await getTokenSymbol(tokenAddress, provider);

            problematicData.push({
              learn2earnId: i,
              firebaseId: firebaseId || `contract-${i}`,
              network: activeNetwork,
              tokenAddress,
              tokenSymbol,
              totalTokens: tokenAmount,
              claimedTokens: distributedTokens,
              remainingTokens: tokenAmount,
              participantCount: participantCount.toNumber(),
              maxParticipants: maxParticipants.toNumber(),
              estimatedRecovery: remainingTokens,
              issues,
              canRecover,
              startTime: startTime.toNumber(),
              endTime: endTime.toNumber(),
              active,
              contractAddress: contractData.contractAddress,
              transactionHash: transactionHash
            });
          }
        } catch (error) {
          console.error(`Error checking Learn2Earn ${i}:`, error);
        }
      }

      setProblematicLearn2Earns(problematicData);
      
      // Calculate statistics
      const totalProblemsCount = problematicData.length;
      const totalAtRisk = problematicData.reduce(
        (sum, item) => sum.add(item.remainingTokens), 
        ethers.BigNumber.from(0)
      );
      const totalRecoverable = problematicData.reduce(
        (sum, item) => item.canRecover ? sum.add(item.estimatedRecovery) : sum, 
        ethers.BigNumber.from(0)
      );
      
      setTotalProblems(totalProblemsCount);
      setTotalTokensAtRisk(totalAtRisk);
      setRecoverableTokens(totalRecoverable);
      
    } catch (error) {
      console.error('Error loading problematic Learn2Earns:', error);
      setError('Failed to load problematic Learn2Earns. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadOperationHistory = async () => {
    try {
      // Ensure we have an active network
      if (!activeNetwork) {
        console.warn('No active network for loading operation history');
        return;
      }
      
      // Load emergency operations from Firebase
      const operationsRef = collection(db, 'emergencyOperations');
      const q = query(
        operationsRef, 
        where('network', '==', activeNetwork),
        orderBy('timestamp', 'desc'),
        limit(10)
      );
      
      const querySnapshot = await getDocs(q);
      const operations: EmergencyOperation[] = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        operations.push({
          id: doc.id,
          timestamp: data.timestamp.toDate(),
          network: data.network,
          learn2earnId: data.learn2earnId,
          action: data.action,
          tokensRecovered: data.tokensRecovered,
          transactionHash: data.transactionHash,
          adminAddress: data.adminAddress,
          reason: data.reason
        });
      });
      
      setOperationHistory(operations);
    } catch (error) {
      console.error('Error loading operation history:', error);
    }
  };

  const handleRecoverTokens = async (learn2earnInfo: Learn2EarnHealthInfo) => {
    if (!walletAddress) {
      setError('Please connect your wallet first');
      return;
    }

    if (!confirm(`Are you sure you want to recover ${ethers.utils.formatEther(learn2earnInfo.estimatedRecovery)} tokens from Learn2Earn #${learn2earnInfo.learn2earnId}?`)) {
      return;
    }

    setProcessingRecovery(learn2earnInfo.learn2earnId);
    setError(null);

    try {
      // No need to switch network - we're already using the current network from wallet
      // Get provider with signer
      const provider = await web3Service.getWeb3Provider();
      if (!provider) {
        throw new Error('Web3 provider not available');
      }

      const signer = provider.getSigner();
      const adminAddress = await signer.getAddress();

      // Create contract instance
      const contractInstance = new ethers.Contract(
        learn2earnInfo.contractAddress,
        [
          "function endLearn2Earn(uint256 _learn2earnId) external",
          "function learn2earns(uint256) external view returns (string memory id, address tokenAddress, uint256 tokenAmount, uint256 startTime, uint256 endTime, uint256 maxParticipants, uint256 participantCount, bool active)"
        ],
        signer
      );

      console.log(`Calling endLearn2Earn for ID ${learn2earnInfo.learn2earnId}`);
      
      // Call endLearn2Earn function
      const tx = await contractInstance.endLearn2Earn(learn2earnInfo.learn2earnId);
      console.log(`Transaction sent: ${tx.hash}`);
      
      // Wait for confirmation
      const receipt = await tx.wait(1);
      console.log(`Transaction confirmed: ${receipt.transactionHash}`);

      // Record the operation in Firebase
      const newOperation: EmergencyOperation = {
        id: Date.now().toString(),
        timestamp: new Date(),
        network: learn2earnInfo.network,
        learn2earnId: learn2earnInfo.learn2earnId,
        action: 'emergency_end',
        tokensRecovered: ethers.utils.formatEther(learn2earnInfo.estimatedRecovery),
        transactionHash: receipt.transactionHash,
        adminAddress,
        reason: learn2earnInfo.issues.join(', ')
      };

      // Save to Firebase
      try {
        const operationRef = doc(collection(db, 'emergencyOperations'));
        await setDoc(operationRef, {
          ...newOperation,
          timestamp: new Date(),
          createdAt: new Date()
        });
      } catch (fbError) {
        console.warn('Failed to save operation to Firebase:', fbError);
      }
      
      setOperationHistory(prev => [newOperation, ...prev]);
      
      // Remove from problematic list
      setProblematicLearn2Earns(prev => 
        prev.filter(item => item.learn2earnId !== learn2earnInfo.learn2earnId)
      );
      
      // Update statistics
      setTotalProblems(prev => prev - 1);
      setTotalTokensAtRisk(prev => prev.sub(learn2earnInfo.remainingTokens));
      setRecoverableTokens(prev => prev.sub(learn2earnInfo.estimatedRecovery));
      
      alert(`Successfully recovered ${ethers.utils.formatEther(learn2earnInfo.estimatedRecovery)} tokens! Transaction: ${receipt.transactionHash}`);
      
    } catch (error: any) {
      console.error('Error recovering tokens:', error);
      let errorMessage = 'Failed to recover tokens';
      
      if (error.message?.includes('Ownable: caller is not the owner')) {
        errorMessage = 'Access denied: Only the contract owner can perform emergency withdrawals';
      } else if (error.message?.includes('Learn2Earn does not exist')) {
        errorMessage = 'Learn2Earn not found on blockchain';
      } else if (error.message?.includes('Learn2Earn is already inactive')) {
        errorMessage = 'Learn2Earn is already inactive';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
    } finally {
      setProcessingRecovery(null);
    }
  };

  const formatTokenAmount = (amount: ethers.BigNumber) => {
    try {
      return parseFloat(ethers.utils.formatEther(amount)).toFixed(2);
    } catch {
      return '0.00';
    }
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const getIssueColor = (issue: string) => {
    if (issue.includes('missing from database')) return 'text-red-400';
    if (issue.includes('expired')) return 'text-orange-400';
    if (issue.includes('No participants')) return 'text-yellow-400';
    if (issue.includes('low participation')) return 'text-blue-400';
    return 'text-gray-400';
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getTokenSymbol = async (tokenAddress: string, provider: any): Promise<string> => {
    try {
      const tokenContract = new ethers.Contract(
        tokenAddress,
        ["function symbol() view returns (string)"],
        provider
      );
      return await tokenContract.symbol();
    } catch (error) {
      console.warn(`Could not fetch symbol for token ${tokenAddress}:`, error);
      return 'UNKNOWN';
    }
  };

  const getTransactionHashFromBlockchain = async (learn2earnId: number, contractAddress: string, provider: any): Promise<string> => {
    try {
      console.log(`Searching for transaction hash for Learn2Earn ID ${learn2earnId}`);
      
      // Get current block for reference
      const currentBlock = await provider.getBlockNumber();
      console.log(`Current block: ${currentBlock}`);
      
      // Search in a larger range - last 100k blocks (roughly 2-3 days on Polygon)
      const fromBlock = Math.max(0, currentBlock - 100000);
      
      console.log(`Searching from block ${fromBlock} to ${currentBlock}`);

      // Try multiple possible event signatures
      const possibleEvents = [
        "event Learn2EarnCreated(uint256 indexed learn2earnId, address indexed creator, address indexed tokenAddress, uint256 tokenAmount)",
        "event Learn2EarnCreated(uint256 indexed id, address indexed creator, address indexed token, uint256 amount)",
        "event Created(uint256 indexed learn2earnId, address indexed creator, address indexed tokenAddress, uint256 tokenAmount)",
        "event NewLearn2Earn(uint256 indexed learn2earnId, address indexed creator, address indexed tokenAddress, uint256 tokenAmount)"
      ];

      for (const eventSignature of possibleEvents) {
        try {
          console.log(`Trying event signature: ${eventSignature}`);
          
          const contractInstance = new ethers.Contract(contractAddress, [eventSignature], provider);
          
          // Get all events of this type first to see what's available
          const allEventsFilter = contractInstance.filters[Object.keys(contractInstance.filters)[0]]();
          const allEvents = await contractInstance.queryFilter(allEventsFilter, fromBlock, 'latest');
          
          console.log(`Found ${allEvents.length} total events of this type`);
          
          // Now filter for our specific learn2earnId
          const specificFilter = contractInstance.filters[Object.keys(contractInstance.filters)[0]](learn2earnId);
          const specificEvents = await contractInstance.queryFilter(specificFilter, fromBlock, 'latest');
          
          console.log(`Found ${specificEvents.length} events for Learn2Earn ID ${learn2earnId}`);
          
          if (specificEvents.length > 0) {
            const txHash = specificEvents[0].transactionHash;
            console.log(`✅ Found transaction hash: ${txHash}`);
            return txHash;
          }
          
        } catch (eventError: any) {
          console.log(`Event signature failed: ${eventError.message}`);
          continue;
        }
      }
      
      // If no specific events found, let's try to get ALL events from the contract 
      // and manually search through them
      console.log(`No specific events found, searching ALL events from contract...`);
      
      try {
        // Get all logs from the contract in the range
        const logs = await provider.getLogs({
          fromBlock: fromBlock,
          toBlock: 'latest',
          address: contractAddress
        });
        
        console.log(`Found ${logs.length} total logs from contract`);
        
        // Look through logs for any that might contain our learn2earnId
        for (const log of logs) {
          if (log.topics && log.topics.length > 1) {
            // Check if any topic contains our learn2earnId
            for (const topic of log.topics) {
              try {
                const topicValue = ethers.BigNumber.from(topic).toNumber();
                if (topicValue === learn2earnId) {
                  console.log(`✅ Found Learn2Earn ID ${learn2earnId} in log topic: ${log.transactionHash}`);
                  return log.transactionHash;
                }
              } catch (e) {
                // Topic is not a number, skip
                continue;
              }
            }
          }
        }
        
      } catch (logsError: any) {
        console.warn(`Error getting logs: ${logsError.message}`);
      }
      
      console.log(`❌ No transaction hash found for Learn2Earn ${learn2earnId}`);
      return 'Not Found';
      
    } catch (error: any) {
      console.error(`Error searching for transaction hash for Learn2Earn ${learn2earnId}:`, error);
      return 'Search Error';
    }
  };

  if (!walletAddress) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-black/30 backdrop-blur-md rounded-xl p-6">
          <h2 className="text-2xl font-bold text-orange-400 mb-2">Emergency Token Withdrawal</h2>
          <p className="text-gray-300">Monitor and recover tokens from problematic Learn2Earn contracts</p>
        </div>

        {/* Network Info - Not Connected */}
        <div className="bg-black/30 backdrop-blur-md rounded-xl p-6">
          <label className="block text-gray-300 mb-2">Current Network:</label>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-gray-400 font-medium text-lg">Not Connected</span>
            <span className="text-orange-400 text-sm">(Please connect wallet)</span>
          </div>
        </div>

        {/* Statistics Dashboard - Empty State */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6">
            <h3 className="text-red-400 font-semibold mb-2">Total Problems</h3>
            <p className="text-3xl font-bold text-gray-500">--</p>
          </div>
          
          <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-6">
            <h3 className="text-orange-400 font-semibold mb-2">Tokens at Risk</h3>
            <p className="text-3xl font-bold text-gray-500">--</p>
          </div>
          
          <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-6">
            <h3 className="text-green-400 font-semibold mb-2">Recoverable Tokens</h3>
            <p className="text-3xl font-bold text-gray-500">--</p>
          </div>
        </div>

        {/* Connection Required Message */}
        <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-8">
          <div className="text-center">
            <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-orange-400 mb-2">Wallet Connection Required</h3>
            <p className="text-gray-300 mb-4">
              Please connect your wallet using the "Connect to Web3" button in the sidebar to access emergency withdrawal functions and monitor Learn2Earn contracts.
            </p>
            <div className="flex flex-col items-center gap-2">
              <p className="text-sm text-gray-400">
                ⚡ Real-time blockchain monitoring
              </p>
              <p className="text-sm text-gray-400">
                🔒 Secure token recovery operations
              </p>
              <p className="text-sm text-gray-400">
                📊 Detailed problematic contract analysis
              </p>
            </div>
          </div>
        </div>

        {/* Problematic Learn2Earns - Empty State */}
        <div className="bg-black/30 backdrop-blur-md rounded-xl p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-orange-400">Problematic Learn2Earns</h3>
            <button
              disabled
              className="bg-gray-600 text-gray-400 px-4 py-2 rounded-lg text-sm cursor-not-allowed"
            >
              Connect Wallet to Scan
            </button>
          </div>
          <div className="text-center py-8">
            <p className="text-gray-400">🔌 Connect your wallet to scan blockchain for problematic contracts</p>
          </div>
        </div>

        {/* Operation History - Empty State */}
        <div className="bg-black/30 backdrop-blur-md rounded-xl p-6">
          <h3 className="text-xl font-bold text-orange-400 mb-4">Recent Emergency Operations</h3>
          <div className="text-center py-8">
            <p className="text-gray-400">📋 Connect your wallet to view operation history</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-black/30 backdrop-blur-md rounded-xl p-6">
        <h2 className="text-2xl font-bold text-orange-400 mb-2">Emergency Token Withdrawal</h2>
        <p className="text-gray-300">Monitor and recover tokens from problematic Learn2Earn contracts</p>
      </div>

      {/* Network Info */}
      <div className="bg-black/30 backdrop-blur-md rounded-xl p-6">
        <label className="block text-gray-300 mb-2">Current Network:</label>
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-white font-medium text-lg">
            {currentNetwork ? currentNetwork.charAt(0).toUpperCase() + currentNetwork.slice(1) : 'Not Connected'}
          </span>
          {!currentNetwork && (
            <span className="text-orange-400 text-sm">(Please connect wallet)</span>
          )}
          {currentNetwork && activeNetwork && !supportedNetworks.includes(activeNetwork) && (
            <span className="text-red-400 text-sm">(Network not supported)</span>
          )}
        </div>
        {supportedNetworks.length > 0 && (
          <p className="text-gray-400 text-sm mt-2">
            Supported networks: {supportedNetworks.map(n => n.charAt(0).toUpperCase() + n.slice(1)).join(', ')}
          </p>
        )}
      </div>

      {/* Statistics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6">
          <h3 className="text-red-400 font-semibold mb-2">Total Problems</h3>
          <p className="text-3xl font-bold text-white">{totalProblems}</p>
        </div>
        
        <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-6">
          <h3 className="text-orange-400 font-semibold mb-2">Tokens at Risk</h3>
          <p className="text-3xl font-bold text-white">{formatTokenAmount(totalTokensAtRisk)}</p>
        </div>
        
        <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-6">
          <h3 className="text-green-400 font-semibold mb-2">Recoverable Tokens</h3>
          <p className="text-3xl font-bold text-white">{formatTokenAmount(recoverableTokens)}</p>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-400">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-300 hover:text-red-100 text-sm mt-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Problematic Learn2Earns */}
      <div className="bg-black/30 backdrop-blur-md rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-bold text-orange-400">Problematic Learn2Earns</h3>
          <button
            onClick={loadProblematicLearn2Earns}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm"
          >
            {loading ? 'Scanning...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
            <p className="text-gray-300 mt-2">Scanning blockchain for problems...</p>
          </div>
        ) : problematicLearn2Earns.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-300">✅ No problematic Learn2Earns detected{activeNetwork ? ` on ${activeNetwork}` : ''}</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block space-y-3">
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-gray-800/50 rounded-lg text-sm font-medium text-gray-300">
                <div className="col-span-1">#</div>
                <div className="col-span-2">Network</div>
                <div className="col-span-2">Start Date</div>
                <div className="col-span-1">Token</div>
                <div className="col-span-2">Token Contract</div>
                <div className="col-span-2">Transaction</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-1">Actions</div>
              </div>

              {/* Learn2Earn Items */}
              {problematicLearn2Earns.map((item) => (
                <div key={item.learn2earnId} className="border border-gray-600 rounded-lg overflow-hidden">
                  {/* Compact Row */}
                  <div 
                    className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-gray-800/30 cursor-pointer transition-colors"
                    onClick={() => setExpandedItem(expandedItem === item.learn2earnId ? null : item.learn2earnId)}
                  >
                    <div className="col-span-1 text-white font-medium">#{item.learn2earnId}</div>
                    <div className="col-span-2 text-gray-300">
                      {item.network.charAt(0).toUpperCase() + item.network.slice(1)}
                    </div>
                    <div className="col-span-2 text-gray-300 text-sm">
                      {formatTimestamp(item.startTime).split(',')[0]}
                    </div>
                    <div className="col-span-1 text-orange-400 font-medium">{item.tokenSymbol}</div>
                    <div className="col-span-2 text-gray-400 text-xs font-mono">
                      {item.tokenAddress.slice(0, 6)}...{item.tokenAddress.slice(-4)}
                    </div>
                    <div className="col-span-2 text-gray-400 text-xs">
                      <span className="text-gray-400">Tx Hash:</span>
                      <p className="text-gray-300 font-mono text-xs">
                        {item.transactionHash === 'Not Found' || item.transactionHash === 'Search Error'
                          ? item.transactionHash 
                          : `${item.transactionHash.slice(0, 8)}...${item.transactionHash.slice(-6)}`}
                      </p>
                    </div>
                    <div className="col-span-1">
                      {item.canRecover && (
                        <span className="bg-green-600 text-white px-2 py-1 rounded text-xs">
                          REC
                        </span>
                      )}
                    </div>
                    <div className="col-span-1">
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedItem(expandedItem === item.learn2earnId ? null : item.learn2earnId);
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                        >
                          {expandedItem === item.learn2earnId ? '▲' : '▼'}
                        </button>
                        {item.canRecover && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRecoverTokens(item);
                            }}
                            disabled={processingRecovery === item.learn2earnId}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-2 py-1 rounded text-xs"
                          >
                            {processingRecovery === item.learn2earnId ? '...' : 'REC'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedItem === item.learn2earnId && (
                    <div className="px-4 py-4 border-t border-gray-600 bg-gray-900/30">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* Basic Info */}
                        <div className="space-y-3">
                          <h4 className="text-orange-400 font-semibold mb-2">Basic Information</h4>
                          <div>
                            <span className="text-gray-400 text-sm">Blockchain ID:</span>
                            <p className="text-white text-sm break-all">{item.firebaseId}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-sm">Total Tokens:</span>
                            <p className="text-white font-medium">{formatTokenAmount(item.totalTokens)} {item.tokenSymbol}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-sm">Participants:</span>
                            <p className="text-white font-medium">
                              {item.participantCount} / {item.maxParticipants > 0 ? item.maxParticipants : '∞'}
                            </p>
                          </div>
                        </div>

                        {/* Addresses */}
                        <div className="space-y-3">
                          <h4 className="text-orange-400 font-semibold mb-2">Contract Details</h4>
                          <div>
                            <span className="text-gray-400 text-sm">Token Address:</span>
                            <p className="text-white text-xs font-mono break-all">{item.tokenAddress}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-sm">Contract Address:</span>
                            <p className="text-white text-xs font-mono break-all">{item.contractAddress}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-sm">Token Symbol:</span>
                            <p className="text-orange-400 font-medium">{item.tokenSymbol}</p>
                          </div>
                        </div>

                        {/* Recovery Info */}
                        <div className="space-y-3">
                          <h4 className="text-orange-400 font-semibold mb-2">Recovery Information</h4>
                          <div>
                            <span className="text-gray-400 text-sm">Est. Recovery:</span>
                            <p className="text-green-400 font-medium">{formatTokenAmount(item.estimatedRecovery)} {item.tokenSymbol}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-sm">Remaining Tokens:</span>
                            <p className="text-white">{formatTokenAmount(item.remainingTokens)} {item.tokenSymbol}</p>
                          </div>
                          <div>
                            <span className="text-gray-400 text-sm">Transaction Hash:</span>
                            <p className="text-gray-300 text-sm font-mono">
                              {item.transactionHash === 'Not Found' || item.transactionHash === 'Search Error'
                                ? item.transactionHash 
                                : (
                                  <a 
                                    href={`https://${item.network === 'ethereum' ? 'etherscan.io' : 
                                      item.network === 'polygon' ? 'polygonscan.com' :
                                      item.network === 'binance' ? 'bscscan.com' : 
                                      'etherscan.io'}/tx/${item.transactionHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300"
                                  >
                                    {item.transactionHash.slice(0, 12)}...{item.transactionHash.slice(-8)} ↗
                                  </a>
                                )}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Issues */}
                      <div className="mt-4 pt-4 border-t border-gray-700">
                        <h4 className="text-red-400 font-semibold mb-2">Detected Issues:</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {item.issues.map((issue, index) => (
                            <li key={index} className={`text-sm ${getIssueColor(issue)}`}>
                              {issue}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Timestamps */}
                      <div className="mt-4 pt-4 border-t border-gray-700">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-gray-400">Start Time:</span>
                            <p className="text-white">{formatTimestamp(item.startTime)}</p>
                          </div>
                          <div>
                            <span className="text-gray-400">End Time:</span>
                            <p className="text-white">{formatTimestamp(item.endTime)}</p>
                          </div>
                          <div>
                            <span className="text-gray-400">Active Status:</span>
                            <p className={item.active ? 'text-green-400' : 'text-red-400'}>
                              {item.active ? 'Active' : 'Inactive'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {problematicLearn2Earns.map((item) => (
                <div key={item.learn2earnId} className="border border-gray-600 rounded-lg overflow-hidden">
                  {/* Mobile Compact Card */}
                  <div 
                    className="p-4 hover:bg-gray-800/30 cursor-pointer transition-colors"
                    onClick={() => setExpandedItem(expandedItem === item.learn2earnId ? null : item.learn2earnId)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-white font-bold text-lg">#{item.learn2earnId}</span>
                        <span className="text-orange-400 font-medium">{item.tokenSymbol}</span>
                        {item.canRecover && (
                          <span className="bg-green-600 text-white px-2 py-1 rounded text-xs">REC</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedItem(expandedItem === item.learn2earnId ? null : item.learn2earnId);
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
                        >
                          {expandedItem === item.learn2earnId ? '▲' : '▼'}
                        </button>
                        {item.canRecover && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRecoverTokens(item);
                            }}
                            disabled={processingRecovery === item.learn2earnId}
                            className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-2 py-1 rounded text-xs"
                          >
                            {processingRecovery === item.learn2earnId ? '...' : 'REC'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-400">Network:</span>
                        <p className="text-gray-300">{item.network.charAt(0).toUpperCase() + item.network.slice(1)}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Started:</span>
                        <p className="text-gray-300">{formatTimestamp(item.startTime).split(',')[0]}</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Token Contract:</span>
                        <p className="text-gray-300 font-mono text-xs">{item.tokenAddress.slice(0, 8)}...</p>
                      </div>
                      <div>
                        <span className="text-gray-400">Tx Hash:</span>
                        <p className="text-gray-300 text-xs font-mono">
                          {item.transactionHash === 'Not Found' || item.transactionHash === 'Search Error'
                            ? item.transactionHash 
                            : `${item.transactionHash.slice(0, 6)}...${item.transactionHash.slice(-4)}`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Mobile Expanded Details */}
                  {expandedItem === item.learn2earnId && (
                    <div className="px-4 py-4 border-t border-gray-600 bg-gray-900/30 space-y-4">
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <h4 className="text-orange-400 font-semibold mb-2">Basic Information</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-400">Total Tokens:</span>
                              <span className="text-white">{formatTokenAmount(item.totalTokens)} {item.tokenSymbol}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Participants:</span>
                              <span className="text-white">{item.participantCount} / {item.maxParticipants > 0 ? item.maxParticipants : '∞'}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Recovery:</span>
                              <span className="text-green-400">{formatTokenAmount(item.estimatedRecovery)} {item.tokenSymbol}</span>
                            </div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-red-400 font-semibold mb-2">Issues:</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {item.issues.map((issue, index) => (
                              <li key={index} className={`text-sm ${getIssueColor(issue)}`}>
                                {issue}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div>
                          <h4 className="text-orange-400 font-semibold mb-2">Addresses:</h4>
                          <div className="space-y-2 text-xs">
                            <div>
                              <span className="text-gray-400">Token:</span>
                              <p className="text-white font-mono break-all">{item.tokenAddress}</p>
                            </div>
                            <div>
                              <span className="text-gray-400">Contract:</span>
                              <p className="text-white font-mono break-all">{item.contractAddress}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Operation History */}
      <div className="bg-black/30 backdrop-blur-md rounded-xl p-6">
        <h3 className="text-xl font-bold text-orange-400 mb-4">Recent Emergency Operations</h3>
        
        {operationHistory.length === 0 ? (
          <p className="text-gray-300">No emergency operations recorded on this network</p>
        ) : (
          <div className="space-y-3">
            {operationHistory.map((operation) => (
              <div key={operation.id} className="border border-gray-600 rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="bg-green-600 text-white px-2 py-1 rounded text-xs">
                        {operation.action.replace('_', ' ').toUpperCase()}
                      </span>
                      <span className="text-white font-medium">
                        Learn2Earn #{operation.learn2earnId}
                      </span>
                    </div>
                    <p className="text-green-400 font-medium">
                      Recovered {operation.tokensRecovered} tokens
                    </p>
                    <p className="text-gray-400 text-sm">Reason: {operation.reason}</p>
                    <p className="text-gray-500 text-xs">
                      By: {operation.adminAddress.slice(0, 6)}...{operation.adminAddress.slice(-4)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-sm">{formatDate(operation.timestamp)}</p>
                    <a
                      href={`https://${operation.network === 'ethereum' ? 'etherscan.io' : 
                        operation.network === 'polygon' ? 'polygonscan.com' :
                        operation.network === 'binance' ? 'bscscan.com' : 
                        'etherscan.io'}/tx/${operation.transactionHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 text-xs"
                    >
                      View Transaction ↗
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default EmergencyTokenPanel;
