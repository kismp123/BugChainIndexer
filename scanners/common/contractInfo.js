/**
 * Contract Info Fetcher
 * 컨트랙트 이름 정보 조회 모듈
 *
 * 데이터 소스:
 * 1. Kleros Scout public_name_tag (CAIP-10 형식)
 */

const KLEROS_REGISTRY = "0x66260c69d03837016d88c9877e61e08ef74c59f2";
const KLEROS_SUBGRAPH_URL = "https://api.studio.thegraph.com/query/61738/legacy-curate-gnosis/version/latest";
const KLEROS_IPFS_GATEWAY = "https://cdn.kleros.link";

// Kleros 태그 캐시 (메모리)
let klerosTagCache = null;
let klerosTagCacheTime = 0;
const KLEROS_CACHE_TTL = 3600000; // 1시간

/**
 * Kleros Scout에서 모든 Registered 태그 로드
 * @returns {Promise<Map<string, object>>} CAIP-10 주소 -> 태그 정보 맵
 */
async function loadKlerosTags() {
  // 캐시 확인
  if (klerosTagCache && Date.now() - klerosTagCacheTime < KLEROS_CACHE_TTL) {
    return klerosTagCache;
  }

  const tagMap = new Map();
  let skip = 0;
  const batchSize = 1000;

  while (true) {
    // Registered + Absent(등록 해제됨) 모두 포함
    // Absent는 이전에 등록되었다가 제거된 항목 (이름 정보는 유효)
    const query = `{
      litems(
        where: {registryAddress: "${KLEROS_REGISTRY}", status_in: ["Registered", "Absent"]},
        first: ${batchSize},
        skip: ${skip},
        orderBy: id
      ) {
        data
        status
      }
    }`;

    try {
      const r = await fetch(KLEROS_SUBGRAPH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      const result = await r.json();
      const items = result.data?.litems || [];

      if (items.length === 0) break;

      // 병렬로 IPFS 데이터 조회
      const promises = items.map(item => fetchIPFSData(item.data, item.status));
      const results = await Promise.all(promises);

      results.forEach(data => {
        if (data && data.contractAddress) {
          const key = data.contractAddress.toLowerCase();
          // Registered 상태 우선 (같은 주소가 여러 상태로 있을 수 있음)
          const existing = tagMap.get(key);
          if (!existing || data.status === 'Registered') {
            tagMap.set(key, data);
          }
        }
      });

      if (items.length < batchSize) break;
      skip += batchSize;

      await sleep(100); // Rate limit
    } catch (err) {
      console.error('[contractInfo] Kleros load error:', err.message);
      break;
    }
  }

  klerosTagCache = tagMap;
  klerosTagCacheTime = Date.now();

  return tagMap;
}

/**
 * IPFS에서 Kleros item 데이터 조회
 * @param {string} ipfsPath - IPFS 경로
 * @param {string} status - Kleros 상태 (Registered, Absent 등)
 */
async function fetchIPFSData(ipfsPath, status = 'Registered') {
  if (!ipfsPath || !ipfsPath.includes('/ipfs/')) return null;

  try {
    const url = `${KLEROS_IPFS_GATEWAY}${ipfsPath}`;
    const r = await fetch(url);
    const d = await r.json();

    if (!d.values) return null;

    return {
      contractAddress: d.values["Contract Address"],
      publicNameTag: d.values["Public Name Tag"],
      projectName: d.values["Project Name"],
      website: d.values["UI/Website Link"],
      note: d.values["Public Note"],
      status // Registered 또는 Absent
    };
  } catch (e) {
    return null;
  }
}

/**
 * 컨트랙트 이름 정보 조회 (Kleros Scout)
 *
 * @param {object} options
 * @param {number} options.chainId - 체인 ID
 * @param {string} options.address - 컨트랙트 주소
 * @returns {Promise<{publicNameTag: string|null, projectName: string|null}>}
 */
async function getContractInfo(options) {
  const { chainId, address } = options;
  const lowerAddress = address.toLowerCase();

  let publicNameTag = null;
  let projectName = null;

  try {
    const klerosMap = await loadKlerosTags();
    const caip10 = `eip155:${chainId}:${lowerAddress}`;
    const klerosData = klerosMap.get(caip10);

    if (klerosData) {
      publicNameTag = klerosData.publicNameTag;
      projectName = klerosData.projectName;
    }
  } catch (err) {
    // Kleros 실패해도 계속 진행
  }

  return { publicNameTag, projectName };
}

/**
 * 여러 컨트랙트의 이름 정보 일괄 조회 (Kleros Scout)
 *
 * @param {object} options
 * @param {number} options.chainId - 체인 ID
 * @param {string[]} options.addresses - 컨트랙트 주소 배열
 * @returns {Promise<Map<string, {publicNameTag, projectName}>>}
 */
async function getContractInfoBatch(options) {
  const { chainId, addresses } = options;

  // Kleros 태그 전체 로드
  const klerosMap = await loadKlerosTags();

  const results = new Map();

  for (const address of addresses) {
    const lowerAddress = address.toLowerCase();
    const caip10 = `eip155:${chainId}:${lowerAddress}`;

    let publicNameTag = null;
    let projectName = null;

    const klerosData = klerosMap.get(caip10);
    if (klerosData) {
      publicNameTag = klerosData.publicNameTag;
      projectName = klerosData.projectName;
    }

    results.set(lowerAddress, { publicNameTag, projectName });
  }

  return results;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Kleros 캐시 초기화 (테스트용)
 */
function clearKlerosCache() {
  klerosTagCache = null;
  klerosTagCacheTime = 0;
}

module.exports = {
  getContractInfo,
  getContractInfoBatch,
  loadKlerosTags,
  clearKlerosCache
};
