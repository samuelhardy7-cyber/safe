import React, {useEffect, useState} from 'react';
import {downloadPrivateStorageBlob} from '../../services/congregationService';
import type {ChurchMembership} from '../../types/domain';

interface MemberAvatarProps {
  churchId: string;
  membership: ChurchMembership;
  fullName: string;
  photoPath?: string;
  sizeClass?: string;
  textClass?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'JM';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const MemberAvatar: React.FC<MemberAvatarProps> = ({
  churchId,
  membership,
  fullName,
  photoPath,
  sizeClass = 'h-10 w-10',
  textClass = 'text-xs',
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let localUrl: string | null = null;
    setObjectUrl(null);

    if (!photoPath) return undefined;

    downloadPrivateStorageBlob(churchId, membership, photoPath, 'image/jpeg')
      .then((blob) => {
        if (!active) return;
        localUrl = URL.createObjectURL(blob);
        setObjectUrl(localUrl);
      })
      .catch(() => {
        if (active) setObjectUrl(null);
      });

    return () => {
      active = false;
      if (localUrl) {
        URL.revokeObjectURL(localUrl);
      }
    };
  }, [churchId, membership, photoPath]);

  if (objectUrl) {
    return (
      <img
        src={objectUrl}
        alt={`Foto profil ${fullName}`}
        className={`${sizeClass} shrink-0 rounded-lg border border-slate-200 bg-slate-100 object-cover dark:border-slate-700 dark:bg-slate-800`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} ${textClass} flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-[#EBF2FC] font-display font-semibold text-[#0F1E36] dark:border-slate-700 dark:bg-violet-950/60 dark:text-violet-200`}
      aria-hidden="true"
    >
      {getInitials(fullName)}
    </div>
  );
};
