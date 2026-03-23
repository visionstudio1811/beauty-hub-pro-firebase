"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminCreateUser = void 0;
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
exports.adminCreateUser = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Unauthorized');
    }
    const data = request.data;
    const callerDoc = await db.collection('users').doc(request.auth.uid).get();
    if (!callerDoc.exists || ((_a = callerDoc.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin') {
        throw new https_1.HttpsError('permission-denied', 'Admin access required');
    }
    const callerOrgId = (_b = callerDoc.data()) === null || _b === void 0 ? void 0 : _b.organizationId;
    if (callerOrgId !== data.organizationId) {
        throw new https_1.HttpsError('permission-denied', 'Organization mismatch');
    }
    const { email, phone, fullName, role, organizationId, organizationRole, password } = data;
    try {
        const userRecord = await admin.auth().createUser({
            email,
            phoneNumber: phone,
            displayName: fullName,
            password: password || Math.random().toString(36).substring(2, 12),
            emailVerified: true,
        });
        await db.collection('users').doc(userRecord.uid).set({
            email,
            phone,
            fullName,
            role,
            organizationId,
            organizationRole: organizationRole || null,
            isActive: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log('Created user:', userRecord.uid, 'for organization:', organizationId);
        return {
            success: true,
            uid: userRecord.uid,
            message: 'User created successfully',
        };
    }
    catch (error) {
        console.error('Error creating user:', error);
        throw new https_1.HttpsError('internal', error.message || 'Failed to create user');
    }
});
//# sourceMappingURL=adminCreateUser.js.map