import _ from "lodash";
import { put, all, call } from "redux-saga/effects";
import { Certificate } from "@govtechsg/open-certificate";
import { types } from "../reducers/certificate";
import getWeb3 from "../services/web3/getWeb3";
import getContract from "../services/web3/getContract";
import CertificateStoreDefinition from "../services/contracts/CertificateStore.json";
import { combinedHash } from "../utils";

const networkID = "5777";

export function* loadCertificateContract({ payload }) {
  const contractStoreAddress = _.get(
    payload,
    "verification.contractAddress",
    null
  );

  const contractDefinition = CertificateStoreDefinition;
  contractDefinition.networks[networkID].address = contractStoreAddress;

  try {
    const web3 = yield getWeb3();
    const contract = yield getContract(web3, contractDefinition);
    // Hack to allow React Dev Tools to print contract object
    contract.toJSON = () =>
      `Contract Functions: ${Object.keys(contract).join("(), ")}()`;

    yield put({
      type: types.LOADING_STORE_SUCCESS,
      payload: { contract }
    });
  } catch (e) {
    yield put({
      type: types.LOADING_STORE_FAILURE,
      payload: e
    });
  }
}

export function* verifyCertificateHash({ payload }) {
  try {
    const { certificate } = payload;
    new Certificate(certificate).verify();

    yield put({
      type: types.VERIFYING_CERTIFICATE_HASH_SUCCESS
    });
  } catch (e) {
    yield put({
      type: types.VERIFYING_CERTIFICATE_HASH_FAILURE,
      payload: e.message
    });
  }
}

export function* verifyCertificateIssued({ payload }) {
  try {
    const { certificate, certificateStore } = payload;
    const merkleRoot = _.get(certificate, "signature.merkleRoot", null);

    // Checks if certificate has been issued
    const isIssued = yield certificateStore.contract.isCertificateIssued.call(
      merkleRoot
    );
    if (!isIssued) throw new Error("Certificate has not been issued");

    yield put({
      type: types.VERIFYING_CERTIFICATE_ISSUED_SUCCESS
    });
  } catch (e) {
    yield put({
      type: types.VERIFYING_CERTIFICATE_ISSUED_FAILURE,
      payload: e.message
    });
  }
}

export function* verifyCertificateNotRevoked({ payload }) {
  try {
    const { certificate, certificateStore } = payload;
    const targetHash = _.get(certificate, "signature.targetHash", null);
    const proof = _.get(certificate, "signature.proof", null);

    // Checks if certificate and path towards merkle root has been revoked
    const combinedHashes = [targetHash];

    proof.reduce((accumulator, currentValue) => {
      const combined = combinedHash(accumulator, currentValue).toString("hex");
      combinedHashes.push(combined);
      return combined;
    }, targetHash);

    for (let i = 0; i < combinedHashes.length; i += 1) {
      const hash = combinedHashes[i];
      const isRevoked = yield certificateStore.contract.isRevoked.call(hash);
      if (isRevoked)
        throw new Error(`Certificate has been revoked, revoked hash: ${hash}`);
    }
    yield put({
      type: types.VERIFYING_CERTIFICATE_REVOCATION_SUCCESS
    });
  } catch (e) {
    yield put({
      type: types.VERIFYING_CERTIFICATE_REVOCATION_FAILURE,
      payload: e.message
    });
  }
}

export function* verifyCertificate({ payload }) {
  yield all([
    call(verifyCertificateHash, { payload }),
    call(verifyCertificateIssued, { payload }),
    call(verifyCertificateNotRevoked, { payload })
  ]);
  yield put({
    type: types.VERIFYING_CERTIFICATE_COMPLETE
  });
}

export default loadCertificateContract;